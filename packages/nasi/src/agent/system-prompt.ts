import { homedir } from "node:os"
import { type Dataset, DECLINED_ANSWER, normalizeAnswer, type Persona } from "@kaja/schema/cli"
import { LOCAL_OWNER } from "@kaja/schema/store"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { LOAD_SKILL_TOOL, type LoadSkillTool, skillsForPersona } from "../abilities/skills"
import { loadDataset as defaultLoadDataset, loadDatasets as defaultLoadDatasets } from "../personas"
import {
  type Agent,
  ASK_USER_TOOL,
  applyPersona,
  DATASET_INFO_TOOL,
  REMEMBER_NOTE_TOOL,
  RUN_COMMAND_TOOL,
  SWITCH_PERSONA_TOOL
} from "./agent"
import type { GeoLocation } from "./geo"
import { toolName } from "./tools"

const ASK_USER_INSTRUCTIONS =
  `You talk to a human through a terminal, and the human can only reply ` +
  `when you call the ${ASK_USER_TOOL} tool — plain text output is shown to ` +
  `them but gives them no way to answer. So EVERY time you expect a reply — ` +
  `a question, a confirmation, their turn in a game (e.g. "Question 3: is ` +
  `it alive?") — deliver it by calling ${ASK_USER_TOOL}. Never write a ` +
  `question as plain text: plain messages are only for statements and ` +
  `results that need no reply, and end the conversation turn. That also ` +
  `means no courtesy closers like "Would you like...?" or "Let me know ` +
  `if..." — the conversation is over the moment you send plain text, so ` +
  `either call ${ASK_USER_TOOL} because you genuinely need an answer, or ` +
  `just state the result and stop.`

function osName() {
  if (process.platform === "win32") return "Windows"
  if (process.platform === "darwin") return "macOS"
  return "Linux"
}

/** Grounds the model in the host OS and home directory. Cloud hosts should override via PromptContext.environment. */
function defaultEnvironmentInstructions() {
  return `You are running on ${osName()}. Use ${process.platform === "win32" ? "backslash" : "forward-slash"} paths accordingly. The user's home directory is ${homedir()}.`
}

const LANGUAGE_NAME: Record<string, string> = {
  "en-GB": "English",
  "hu-HU": "Hungarian",
  "nan-TW": "Taiwanese Hokkien"
}

/** Builds a PromptContext.replyLanguageInstruction for a UI language code — "en-GB" is omitted (it's already the model's default), any other known code tells the model to reply in that language. */
export function replyLanguageInstructionFor(language: string): string | undefined {
  if (language === "en-GB") return undefined
  const name = LANGUAGE_NAME[language]
  return name
    ? `Reply in ${name}, regardless of what language the user writes in, unless they ask you to switch.`
    : undefined
}

function personaListItem(p: Persona) {
  const when = p.when ? `: use when ${p.when}` : ""
  return `- ${p.id} (${p.label})${when}`
}

function locationInstructions(loc: GeoLocation) {
  return (
    `The user is located in ${loc.city.name}, ${loc.country.name} ` +
    `(timezone ${loc.location.timeZone}, lat ${loc.location.latitude}, ` +
    `lon ${loc.location.longitude}), resolved from their public IP. Use ` +
    `this as the default for location-specific questions (weather, "near ` +
    `me", local time) unless the user says otherwise.`
  )
}

function datasetInstructions(topic: string, label: string) {
  return (
    `You are responsible for collecting the "${label}" (topic "${topic}") ` +
    `dataset via the ${DATASET_INFO_TOOL} tool. Start by calling ` +
    `get_status with dataset="${topic}" to see which fields are already ` +
    `answered and which remain. Ask about unanswered fields one at a time, ` +
    `phrasing each field's prompt naturally and conversationally rather ` +
    `than reading it verbatim — deliver each question via ${ASK_USER_TOOL}. ` +
    `Call answer as soon as the human replies to persist it, then move on ` +
    `to the next unanswered field.`
  )
}

const RUN_COMMAND_INSTRUCTIONS =
  `Use ${RUN_COMMAND_TOOL} to run a shell command on the user's computer — ` +
  `e.g. playing a sound, converting a file, checking installed tools. Set ` +
  `mutates to false only for purely read-only commands, which run ` +
  `immediately with no human approval. When unsure whether a command ` +
  `mutates state, set mutates to true. This includes commands that only ` +
  `write to a temp directory: ` +
  `writing a file is a mutation regardless of where it lands, so mutates ` +
  `stays true even if nothing outside temp is touched. Mutating commands ` +
  `are shown to the human, who must approve them before they run; if they ` +
  `decline, treat it as not done and tell them so, don't retry the same ` +
  `command silently. Prefer read-only tools for anything that only needs ` +
  `to inspect something — reserve this for when you actually need to ` +
  `change state or invoke an external program.`

const MEMORY_INSTRUCTIONS =
  "You have persistent memory across sessions. Save durable facts about " +
  `the user or project with ${REMEMBER_NOTE_TOOL} the moment you learn ` +
  "them — don't ask permission first. Search past facts with " +
  "recall_memory whenever earlier context could help with the current " +
  "question. Audit what's stored with list_notes, and delete stale or " +
  "wrong notes with forget_note. Notes marked " +
  "sticky are shown to you automatically at the start of every future " +
  "session; use sticky for things that should always be known (who the " +
  "user is, their preferences), and non-sticky for things only worth " +
  "recalling on a relevant query. Name keys with a scope prefix — " +
  "user:, project:, decision: — like user:communication-style, so keys " +
  "stay consistent and don't collide."

async function buildStickyBlock(agent: Agent, hasMemory: boolean, owner: string | null): Promise<string | undefined> {
  const ctx = agent.promptContext ?? {}
  const loadSticky =
    ctx.loadStickyNotes ??
    (hasMemory && agent.store
      ? async () => Object.entries(await agent.store!.loadMemory(owner)).filter(([, note]) => note.sticky)
      : undefined)
  const stickyNotes = hasMemory && loadSticky ? await loadSticky() : []
  if (stickyNotes.length === 0) return undefined
  return `Known context about this user/project (from persistent memory):\n${stickyNotes
    .map(([key, note]) => `- [${key}] ${note.content}`)
    .join("\n")}`
}

async function buildEnvironmentBlock(agent: Agent): Promise<string> {
  const ctx = agent.promptContext ?? {}
  const location = ctx.location ?? (ctx.loadLocation ? await ctx.loadLocation() : undefined)
  const locationBlock = location ? locationInstructions(location) : undefined
  return [ctx.environment ?? defaultEnvironmentInstructions(), locationBlock].filter(Boolean).join("\n")
}

function buildPersonasBlock(agent: Agent, toolNames: Set<string>): string | undefined {
  if (!(toolNames.has(SWITCH_PERSONA_TOOL) && agent.personas.length > 1)) return undefined
  return (
    `You can change your own persona mid-conversation by calling ` +
    `${SWITCH_PERSONA_TOOL} when the topic clearly matches another ` +
    `persona's purpose. Current persona: "${agent.personaId ?? "unknown"}". ` +
    `Available personas:\n` +
    agent.personas.map(personaListItem).join("\n") +
    `\nSwitch only when the fit is clear — when unsure, stay put. ` +
    `Don't announce the mechanics of switching; just continue naturally.`
  )
}

function buildSkillsBlock(agent: Agent, toolNames: Set<string>): string | undefined {
  const loadSkill = agent.tools.find(t => toolName(t) === LOAD_SKILL_TOOL) as LoadSkillTool | undefined
  if (!loadSkill?.skills) return undefined
  const skills = skillsForPersona(
    loadSkill.skills,
    agent.personas.find(p => p.id === agent.personaId)
  )
  if (skills.length === 0) return undefined
  const scripts = toolNames.has(RUN_COMMAND_TOOL)
    ? ` Run a skill's bundled scripts with ${RUN_COMMAND_TOOL}, using their absolute path under the skill directory ${LOAD_SKILL_TOOL} reports.`
    : ""
  return (
    `Skills are packaged instructions for specific tasks. When a request matches a skill's ` +
    `description, call ${LOAD_SKILL_TOOL} with its name before starting, then follow what it says. ` +
    `Load its other files with ${LOAD_SKILL_TOOL} and a file only when its instructions point to them.` +
    `${scripts}\nAvailable skills:\n` +
    // One line each, so the section never holds a blank line (refreshAbilitiesInPrompt relies on that).
    skills.map(s => `- ${s.name}: ${s.description.replace(/\s+/g, " ").trim()}`).join("\n")
  )
}

async function buildDatasetBlock(agent: Agent, toolNames: Set<string>): Promise<string | undefined> {
  if (!(agent.dataset && toolNames.has(DATASET_INFO_TOOL))) return undefined
  const loadDataset = agent.promptContext?.loadDataset ?? defaultLoadDataset
  const dataset = await loadDataset(agent.dataset)
  return dataset ? datasetInstructions(agent.dataset, dataset.label) : undefined
}

/** "About the user" from every profile dataset: what the user already shared, and how the rest gets filled in. Owner-scoped like memory. */
async function buildProfileBlock(
  agent: Agent,
  toolNames: Set<string>,
  owner: string | null
): Promise<string | undefined> {
  if (!(toolNames.has(DATASET_INFO_TOOL) && agent.store)) return undefined
  const loadDatasets = agent.promptContext?.loadDatasets ?? defaultLoadDatasets
  const sections: string[] = []
  for (const [topic, dataset] of await loadDatasets()) {
    if (dataset.profile) sections.push(await profileSection(agent, topic, dataset, owner))
  }
  return sections.length > 0 ? sections.join("\n\n") : undefined
}

async function profileSection(agent: Agent, topic: string, dataset: Dataset, owner: string | null): Promise<string> {
  const store = agent.store!
  const version = await store.latestDatasetVersion(topic, owner)
  const answers = new Map(
    (version > 0 ? await store.loadDatasetAnswers(topic, owner, version) : []).map(a => [a.field, a.value])
  )
  // A declined field counts as answered (never asked again) but isn't shown.
  const shared = dataset.fields.filter(f => {
    const value = answers.get(f.name)
    return value !== undefined && normalizeAnswer(value) !== DECLINED_ANSWER
  })
  const missing = dataset.fields.filter(f => !answers.has(f.name))
  const lines = [
    shared.length > 0
      ? `What the user shared in their "${dataset.label}" profile (dataset "${topic}"); use it naturally:\n` +
        shared.map(f => `- ${f.name}: ${(answers.get(f.name) ?? "").replaceAll(/\s+/g, " ")}`).join("\n")
      : `The user hasn't shared anything in their "${dataset.label}" profile (dataset "${topic}") yet.`
  ]
  // The persona collecting this dataset asks for everything anyway; the others only pick up what comes along.
  if (agent.dataset !== topic && missing.length > 0) {
    lines.push(
      `When they mention something the profile is still missing (${missing.map(f => f.name).join(", ")}), ` +
        `record it with ${DATASET_INFO_TOOL} (action "answer", dataset "${topic}") without making a fuss, ` +
        `but don't quiz them for the rest.`
    )
    const first = dataset.fields[0]!
    if (!answers.has(first.name)) {
      lines.push(
        `You don't know their ${first.name} yet: early in the conversation, kindly ask once ("${first.prompt}") ` +
          `and record the answer.`
      )
    }
  }
  return lines.join("\n")
}

/**
 * Assembles the system prompt for a fresh session with the given agent.
 * Returns `undefined` if every block is empty.
 */
export async function buildSystemPrompt(agent: Agent, owner: string | null = LOCAL_OWNER): Promise<string | undefined> {
  const toolNames = new Set(agent.tools.map(t => toolName(t)))
  const ctx = agent.promptContext ?? {}
  const hasMemory = toolNames.has(REMEMBER_NOTE_TOOL)

  const stickyBlock = await buildStickyBlock(agent, hasMemory, owner)
  const environmentBlock = await buildEnvironmentBlock(agent)
  const personasBlock = buildPersonasBlock(agent, toolNames)
  const skillsBlock = buildSkillsBlock(agent, toolNames)
  const datasetBlock = await buildDatasetBlock(agent, toolNames)
  const profileBlock = await buildProfileBlock(agent, toolNames, owner)

  return (
    [
      agent.instructions,
      `## Environment\n${environmentBlock}`,
      toolNames.has(ASK_USER_TOOL)
        ? `## Tool contract: ${ASK_USER_TOOL}\n${ctx.askUserInstruction ?? ASK_USER_INSTRUCTIONS}`
        : undefined,
      toolNames.has(RUN_COMMAND_TOOL)
        ? `## Tool contract: ${RUN_COMMAND_TOOL}\n${RUN_COMMAND_INSTRUCTIONS}`
        : undefined,
      hasMemory ? `## Tool contract: memory\n${MEMORY_INSTRUCTIONS}` : undefined,
      personasBlock ? `## Personas\n${personasBlock}` : undefined,
      skillsBlock ? `## Skills\n${skillsBlock}` : undefined,
      datasetBlock ? `## Dataset collection\n${datasetBlock}` : undefined,
      profileBlock ? `## About the user\n${profileBlock}` : undefined,
      stickyBlock,
      ctx.replyLanguageInstruction
    ]
      .filter(Boolean)
      .join("\n\n") || undefined
  )
}

/**
 * Keeps a running conversation in step with the skills and personas enabled now: both lists are written into
 * the system prompt when the conversation starts, so one turned on or off since (on the web, in Telegram)
 * would otherwise never reach it. When the `## Skills` or `## Personas` section no longer matches, the prompt
 * is rebuilt in place, as a persona switch does; unchanged lists leave the message untouched, so prompt
 * caching holds.
 */
export async function refreshAbilitiesInPrompt(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  owner: string | null = LOCAL_OWNER
): Promise<void> {
  const system = messages[0]
  if (system?.role !== "system" || typeof system.content !== "string") return
  const toolNames = new Set(agent.tools.map(t => toolName(t)))
  const upToDate =
    hasSection(system.content, "Skills", buildSkillsBlock(agent, toolNames)) &&
    hasSection(system.content, "Personas", buildPersonasBlock(agent, toolNames))
  if (upToDate) return
  const rebuilt = await buildSystemPrompt(agent, owner)
  if (rebuilt) system.content = rebuilt
}

// Whether `content` holds exactly this `## <title>` section, or no such section when there's no block.
function hasSection(content: string, title: string, block: string | undefined): boolean {
  if (!block) return !content.includes(`## ${title}\n`)
  const section = `## ${title}\n${block}`
  const at = content.indexOf(section)
  const end = at + section.length
  return at >= 0 && (end === content.length || content.startsWith("\n\n", end))
}

/**
 * {@link applyPersona} plus rewriting `messages`' system message in place so
 * the next completion request reflects the new persona.
 */
export async function applyPersonaToMessages(
  agent: Agent,
  persona: import("@kaja/schema/cli").Persona,
  messages: ChatCompletionMessageParam[]
) {
  applyPersona(agent, persona)
  const system = await buildSystemPrompt(agent)
  if (system) {
    if (messages[0]?.role === "system") messages[0].content = system
    else messages.unshift({ role: "system", content: system })
  }
}
