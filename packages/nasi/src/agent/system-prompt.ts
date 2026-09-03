import { homedir } from "node:os"
import type { Persona } from "@kaja/schema/cli"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { loadDataset as defaultLoadDataset } from "../personas"
import { loadMemory } from "../store/memory"
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

/** Grounds the model in the host OS and home directory. Hosted hosts should override via PromptContext.environment. */
export function defaultEnvironmentInstructions() {
  return `You are running on ${osName()}. Use ${process.platform === "win32" ? "backslash" : "forward-slash"} paths accordingly. The user's home directory is ${homedir()}.`
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

async function buildStickyBlock(agent: Agent, hasMemory: boolean): Promise<string | undefined> {
  const ctx = agent.promptContext ?? {}
  const loadSticky =
    ctx.loadStickyNotes ??
    (hasMemory ? async () => Object.entries(await loadMemory()).filter(([, note]) => note.sticky) : undefined)
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

async function buildDatasetBlock(agent: Agent, toolNames: Set<string>): Promise<string | undefined> {
  if (!(agent.dataset && toolNames.has(DATASET_INFO_TOOL))) return undefined
  const loadDataset = agent.promptContext?.loadDataset ?? defaultLoadDataset
  const dataset = await loadDataset(agent.dataset)
  return dataset ? datasetInstructions(agent.dataset, dataset.label) : undefined
}

/**
 * Assembles the system prompt for a fresh session with the given agent.
 * Returns `undefined` if every block is empty.
 */
export async function buildSystemPrompt(agent: Agent): Promise<string | undefined> {
  const toolNames = new Set(agent.tools.map(t => toolName(t)))
  const ctx = agent.promptContext ?? {}
  const hasMemory = toolNames.has(REMEMBER_NOTE_TOOL)

  const stickyBlock = await buildStickyBlock(agent, hasMemory)
  const environmentBlock = await buildEnvironmentBlock(agent)
  const personasBlock = buildPersonasBlock(agent, toolNames)
  const datasetBlock = await buildDatasetBlock(agent, toolNames)

  return (
    [
      agent.instructions,
      `## Environment\n${environmentBlock}`,
      toolNames.has(ASK_USER_TOOL) ? `## Tool contract: ${ASK_USER_TOOL}\n${ASK_USER_INSTRUCTIONS}` : undefined,
      toolNames.has(RUN_COMMAND_TOOL)
        ? `## Tool contract: ${RUN_COMMAND_TOOL}\n${RUN_COMMAND_INSTRUCTIONS}`
        : undefined,
      hasMemory ? `## Tool contract: memory\n${MEMORY_INSTRUCTIONS}` : undefined,
      personasBlock ? `## Personas\n${personasBlock}` : undefined,
      datasetBlock ? `## Dataset collection\n${datasetBlock}` : undefined,
      stickyBlock,
      ctx.replyLanguageInstruction
    ]
      .filter(Boolean)
      .join("\n\n") || undefined
  )
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
