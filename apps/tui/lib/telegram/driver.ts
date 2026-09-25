import { existsSync } from "node:fs"
import { homedir } from "node:os"
import {
  compact,
  dropImages,
  isImageRejection,
  LOAD_SKILL_TOOL,
  type LoadSkillTool,
  photoLabel,
  recordPausedCall,
  runApprovedTool,
  samplingOf,
  type Tool,
  toolName
} from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { telegramOwner } from "@kaja/schema/store"
import {
  commandArgument,
  EditThrottle,
  escapeHtml,
  isCommand,
  isPublicHttpUrl,
  renderTelegramHtml,
  splitTelegramMessage,
  telegramImages,
  truncateForStreaming,
  withQuestion
} from "@kaja/shared"
import type { TimelineEvent } from "../../hooks/use-agent"
import { Agent, createSession, run, type Session } from "../agent/agents"
import { isDangerousCommand } from "../agent/command-risk"
import { categorizeError } from "../agent/error-category"
import { runShellCommand } from "../agent/run-command"
import { t } from "../i18n"
import { log } from "../logger"
import { DEFAULT_PERSONA_ID, type Persona } from "../personas/personas"
import { createSessionRow, loadLatestSessionRowForOwner, updateSessionRow } from "../session/store"

/** What the running bot loaded: skills (load_skill's list) and tool abilities (community tools' `ability:<name>` source), by name. */
function loadedAbilities(tools: Tool<any>[]): { skills: string[]; tools: string[] } {
  const loadSkill = tools.find(tool => toolName(tool) === LOAD_SKILL_TOOL) as LoadSkillTool | undefined
  const abilities = tools.flatMap(tool =>
    tool.origin === "community" && tool.source?.startsWith("ability:") ? [tool.source.slice("ability:".length)] : []
  )
  return {
    skills: (loadSkill?.skills ?? []).map(skill => skill.name).sort((a, b) => a.localeCompare(b)),
    tools: [...new Set(abilities)].sort((a, b) => a.localeCompare(b))
  }
}

/** The /abilities reply: what this bot loaded, and how to change it (on the computer: this bot builds its tools once, at start). */
function abilitiesMessage(tools: Tool<any>[], personas: Persona[]): string {
  const loaded = loadedAbilities(tools)
  // default always loads, so like `kaja abilities` it isn't listed as an ability.
  const picked = personas.map(p => p.id).filter(id => id !== DEFAULT_PERSONA_ID)
  const names = (list: string[]) => list.map(name => escapeHtml(name)).join(", ")
  return [
    `<b>${t("telegram.abilitiesTitle")}</b>`,
    ...(loaded.skills.length > 0 ? [t("telegram.abilitiesSkills", { names: names(loaded.skills) })] : []),
    ...(picked.length > 0 ? [t("telegram.abilitiesPersonas", { names: names(picked) })] : []),
    ...(loaded.tools.length > 0 ? [t("telegram.abilitiesTools", { names: names(loaded.tools) })] : []),
    ...(loaded.skills.length + picked.length + loaded.tools.length === 0 ? [t("telegram.abilitiesNone")] : []),
    "",
    t("telegram.abilitiesHint")
  ].join("\n")
}

/** The chat line for a compaction, in the bot's language. */
function compactedLine(result: { beforeTokens: number; afterTokens: number; dropped: boolean }): string {
  return t(result.dropped ? "telegram.compactedDropped" : "telegram.compacted", {
    before: result.beforeTokens.toLocaleString(),
    after: result.afterTokens.toLocaleString()
  })
}

const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp)$/i

/** Where a reply's `![alt](src)` photo comes from: a public URL, or an existing image file by absolute or `~/` path (nothing else, so a reply can't upload an arbitrary file). */
function photoSource(src: string): { url: string } | { path: string } | undefined {
  if (isPublicHttpUrl(src)) return { url: src }
  let path = src.replace(/^file:\/\//, "")
  try {
    // marked percent-encodes the href, so a path with spaces or accents arrives encoded
    path = decodeURI(path)
  } catch {
    return undefined
  }
  if (path.startsWith("~/")) path = homedir() + path.slice(1)
  if (!path.startsWith("/") || !IMAGE_FILE.test(path) || !existsSync(path)) return undefined
  return { path }
}

/** Command preview cap, matching components/layout/confirm-command.tsx's terminal UI. */
const MAX_COMMAND_LINES = 6

/** A minimal, structural inline-keyboard shape — not grammy's InlineKeyboard class — so this module has no grammy dependency. */
export type InlineKeyboardLike = { text: string; callback_data: string }[][]

/**
 * Abstraction over the actual Telegram API calls, so the driver is testable
 * without a live bot and has zero import of grammy itself. lib/telegram-bot.ts
 * implements this against the real bot.api, translating grammy's own errors
 * (429s, "message is not modified") at that boundary.
 */
export type TelegramSender = {
  sendMessage(chatId: number, text: string, opts?: { replyMarkup?: InlineKeyboardLike }): Promise<{ messageId: number }>
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { replyMarkup?: InlineKeyboardLike }
  ): Promise<void>
  answerCallbackQuery(callbackQueryId: string, opts?: { text?: string }): Promise<void>
  /** Sends a photo either from a local file (tool_image events) or a remote URL (display_image events). */
  sendPhoto(chatId: number, photo: { path: string } | { url: string }, opts?: { caption?: string }): Promise<void>
}

export type TelegramDriverConfig = {
  /** Model/tools/instructions baseline every user's Agent is constructed with. */
  agentConfig: ConstructorParameters<typeof Agent>[0]
  personas: Persona[]
  models: CliResolvedModel[]
  /**
   * Fallback persona for a user with no resumable session (including a
   * fresh /new); defaults to personas[0]. A getter rather than a fixed
   * Persona so /new can reflect a persona switched in the terminal *after*
   * the bot process started, without needing a restart.
   */
  getInitialPersona?: () => Persona | undefined | Promise<Persona | undefined>
  sender: TelegramSender
  /**
   * Constructs the Agent for a newly-created UserState. Defaults to `new
   * Agent(...)`; overridable so tests can substitute a fake OpenAI-shaped
   * client the same way tests/lib/agents.test.ts does, without going through
   * the real lib/openai.ts singleton Agent's constructor always pulls in.
   */
  createAgent?: (init: {
    instructions?: string
    sampling?: ReturnType<typeof samplingOf>
    dataset?: string
    personaId?: string
  }) => Agent
}

/** A run_command (`command`) or an HTTP tool call (`tool`) waiting on the user's tap. */
type PendingCommand = ({ kind: "command"; command: string } | { kind: "tool"; name: string; arguments: string }) & {
  /** The message text sent for the approval prompt, so resolving it can append a status line in place. */
  body: string
  messageId: number
}

type UserState = {
  agent: Agent
  session: Session
  events: TimelineEvent[]
  sessionRowId: string | undefined
  persona: Persona
  /** Serializes saves the same way hooks/use-agent.ts's persistChainRef does, so a fast next turn can't race the row-id assignment into a duplicate INSERT. */
  persistChain: Promise<void>
  pendingCommand: PendingCommand | undefined
  busy: boolean
}

export function createTelegramDriver(config: TelegramDriverConfig) {
  const { agentConfig, personas, models, getInitialPersona, sender } = config
  const createAgent =
    config.createAgent ??
    ((init: {
      instructions?: string
      sampling?: ReturnType<typeof samplingOf>
      dataset?: string
      personaId?: string
    }) => new Agent({ ...agentConfig, ...init }))
  // Never evicted: each user's Agent + full events[] stays live in memory for the process lifetime. Accepted tradeoff for a personal bot whose chat is with its owner — not a cache that needs an LRU/TTL at this scale.
  const users = new Map<number, UserState>()
  const creating = new Map<number, Promise<UserState>>()

  async function createUserState(userId: number, resume = true): Promise<UserState> {
    const owner = telegramOwner(userId)
    const resumeRow = resume ? await loadLatestSessionRowForOwner(owner) : undefined
    const persona =
      (resumeRow && personas.find(p => p.id === resumeRow.persona)) ?? (await getInitialPersona?.()) ?? personas[0]!
    const resumeModel = resumeRow && models.find(m => m.model === resumeRow.model)

    const agent = createAgent({
      instructions: persona.instructions ?? agentConfig.instructions,
      sampling: samplingOf(persona),
      dataset: persona.dataset,
      personaId: persona.id
    })
    const startingModel =
      resumeModel ??
      (!resumeRow && persona.models?.chat
        ? models.find(m => m.id === persona.models!.chat && m.task === "chat")
        : undefined)
    if (startingModel) agent.setModel(startingModel)

    return {
      agent,
      session: resumeRow ? (resumeRow.session as Session) : createSession(),
      events: (resumeRow?.events as TimelineEvent[] | undefined) ?? [],
      sessionRowId: resumeRow?.id,
      persona,
      persistChain: Promise.resolve(),
      pendingCommand: undefined,
      busy: false
    }
  }

  async function getUserState(userId: number): Promise<UserState> {
    const existing = users.get(userId)
    if (existing) return existing
    const inFlight = creating.get(userId)
    if (inFlight) return inFlight
    const promise = createUserState(userId).then(state => {
      users.set(userId, state)
      creating.delete(userId)
      return state
    })
    creating.set(userId, promise)
    return promise
  }

  // Unlike hooks/use-agent.ts's fire-and-forget persistSession (which must not block a React state update on a DB write), this one is awaited by runTurn before the turn is considered done — there's no UI to unblock here, and it's a fast local SQLite write, so waiting for it makes "the turn finished" mean the same thing for both Telegram and the DB.
  function persistSession(userId: number, state: UserState): Promise<void> {
    const first = state.events.find((e): e is Extract<TimelineEvent, { type: "user" }> => e.type === "user")
    if (!first) return Promise.resolve()
    const data = {
      persona: state.persona.id,
      model: state.agent.model,
      owner: telegramOwner(userId),
      session: state.session,
      events: state.events
    }
    state.persistChain = state.persistChain
      .then(async () => {
        if (state.sessionRowId === undefined) {
          state.sessionRowId = await createSessionRow({
            ...data,
            title: first.text.split(/[\r\n]/)[0]!.slice(0, 60)
          })
        } else {
          await updateSessionRow(state.sessionRowId, data)
        }
      })
      .catch(error => log.warn("Failed to save telegram session", { error }))
    return state.persistChain
  }

  async function editSafely(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { replyMarkup?: InlineKeyboardLike }
  ) {
    try {
      await sender.editMessageText(chatId, messageId, text, opts)
    } catch (error) {
      log.warn("Telegram edit failed", { error })
    }
  }

  /** Log-and-continue like editSafely: a failed photo upload shouldn't abort the turn's text stream. */
  async function sendPhotoSafely(chatId: number, photo: { path: string } | { url: string }, caption?: string) {
    try {
      await sender.sendPhoto(chatId, photo, caption ? { caption } : undefined)
    } catch (error) {
      log.warn("Telegram photo send failed", { error })
    }
  }

  /**
   * Renders and sends the authoritative final text for a turn, via
   * `edit` (the same dedupe-guarded editor the turn's EditThrottle uses —
   * see runTurn) so this never re-sends an identical edit the throttle
   * already delivered. Chunks past the first (only once the rendered HTML
   * exceeds Telegram's message limit) go out as new messages, since editing
   * only ever targets the one existing placeholder. The reply's Markdown
   * images follow as photos, the text keeping only their alt.
   */
  async function finalizeMessage(edit: (text: string) => Promise<void>, chatId: number, rawText: string) {
    const html = renderTelegramHtml(rawText) || t("telegram.emptyResponse")
    const [first, ...rest] = splitTelegramMessage(html)
    await edit(first!)
    for (const chunk of rest) await sender.sendMessage(chatId, chunk)
    for (const image of telegramImages(rawText)) {
      const photo = photoSource(image.src)
      if (photo) await sendPhotoSafely(chatId, photo, image.alt)
    }
  }

  async function sendConfirmCommand(chatId: number, state: UserState, event: { command: string; description: string }) {
    const dangerous = isDangerousCommand(event.command)
    const lines = event.command.split("\n")
    const preview = lines.slice(0, MAX_COMMAND_LINES).join("\n")
    const hidden = lines.length - MAX_COMMAND_LINES
    const description = dangerous ? `⚠ ${event.description}` : event.description
    const body = [
      renderTelegramHtml(description),
      `<pre><code>$ ${renderTelegramHtml(preview)}</code></pre>`,
      hidden > 0 ? t("confirmCommand.truncated", { count: hidden }) : undefined
    ]
      .filter(Boolean)
      .join("\n")

    // The tool_call id the model provider already minted for this call, already stored on session.pendingRunCommandId — reused as the callback_data correlator instead of generating a separate token, and short enough to fit the Bot API's 64-byte callback_data cap (unlike the command text itself).
    const token = state.session.pendingRunCommandId!
    const keyboard: InlineKeyboardLike = [
      [
        {
          text: `✅ ${t("confirmCommand.yes")}`,
          callback_data: `cmd:approve:${token}`
        },
        {
          text: `❌ ${t("confirmCommand.no")}`,
          callback_data: `cmd:decline:${token}`
        }
      ]
    ]
    const sent = await sender.sendMessage(chatId, body, {
      replyMarkup: keyboard
    })
    state.pendingCommand = {
      kind: "command",
      command: event.command,
      body,
      messageId: sent.messageId
    }
  }

  async function sendConfirmTool(
    chatId: number,
    state: UserState,
    event: { name: string; arguments: string; summary: string }
  ) {
    const body = [
      renderTelegramHtml(t("confirmCommand.toolRequest", { name: event.name })),
      `<pre><code>→ ${escapeHtml(event.summary)}</code></pre>`
    ].join("\n")
    // Same correlator as sendConfirmCommand: the provider's tool_call id, already stored on the session.
    const token = state.session.pendingToolApprovalId!
    const keyboard: InlineKeyboardLike = [
      [
        { text: `✅ ${t("confirmCommand.yes")}`, callback_data: `tool:approve:${token}` },
        { text: `❌ ${t("confirmCommand.no")}`, callback_data: `tool:decline:${token}` }
      ]
    ]
    const sent = await sender.sendMessage(chatId, body, { replyMarkup: keyboard })
    state.pendingCommand = {
      kind: "tool",
      name: event.name,
      arguments: event.arguments,
      body,
      messageId: sent.messageId
    }
  }

  /**
   * Handles one finalized (non-delta, non-usage) event within a turn's loop.
   * Returns `true` once the event has ended the turn (confirm_command,
   * ask_user, final) so {@link runTurn} knows to stop iterating.
   */
  async function handleFinalizedEvent(
    chatId: number,
    state: UserState,
    accumulated: { content: string },
    throttle: EditThrottle,
    editIfChanged: (text: string) => Promise<void>,
    event: Exclude<TimelineEvent, { type: "user" | "error" }>
  ): Promise<boolean> {
    if (event.type === "compacted") {
      await sender.sendMessage(chatId, compactedLine(event))
      return false
    }

    if (event.type === "persona_switch") {
      // run() already mutated the agent via applyPersona — mirror it into UserState so persistSession writes the new persona id.
      const next = personas.find(p => p.id === event.personaId)
      if (next) state.persona = next
      return false
    }

    if (event.type === "tool_image") {
      await sendPhotoSafely(chatId, { path: event.path })
      return false
    }

    if (event.type === "display_image") {
      await sendPhotoSafely(chatId, { url: event.url }, event.alt)
      return false
    }

    if (event.type === "confirm_command") {
      throttle.cancel()
      if (accumulated.content.trim()) await finalizeMessage(editIfChanged, chatId, accumulated.content)
      await sendConfirmCommand(chatId, state, event)
      return true
    }

    if (event.type === "confirm_tool") {
      throttle.cancel()
      if (accumulated.content.trim()) await finalizeMessage(editIfChanged, chatId, accumulated.content)
      await sendConfirmTool(chatId, state, event)
      return true
    }

    if (event.type === "ask_user") {
      throttle.cancel()
      const text = withQuestion(accumulated.content, event.question)
      await finalizeMessage(editIfChanged, chatId, text)
      return true
    }

    if (event.type === "final") {
      throttle.cancel()
      await finalizeMessage(editIfChanged, chatId, event.content ?? "")
      return true
    }

    return false
  }

  async function runTurn(
    userId: number,
    chatId: number,
    state: UserState,
    prompt: string,
    showUserEvent: boolean,
    images: string[] = []
  ) {
    state.busy = true
    if (showUserEvent) state.events.push({ type: "user", text: images.length > 0 ? photoLabel(prompt) : prompt })
    const turnStart = state.session.messages.length

    const placeholder = await sender.sendMessage(chatId, "…")
    const accumulated = { content: "" }
    const renderCurrent = () =>
      accumulated.content.trim() ? truncateForStreaming(renderTelegramHtml(accumulated.content)) : "…"
    // Shared between the throttle and every direct edit below, so a caller-driven edit (finalize/error) that happens to match whatever the throttle already sent never re-sends the same text.
    let lastSentText: string | undefined
    async function editIfChanged(text: string) {
      if (text === lastSentText) return
      lastSentText = text
      await editSafely(chatId, placeholder.messageId, text)
    }
    const throttle = new EditThrottle(editIfChanged, error => log.warn("Telegram edit failed", { error }))

    try {
      for await (const event of run(state.agent, prompt, state.session, telegramOwner(userId), images)) {
        if (event.type === "delta") {
          // Reasoning deltas are omitted from the live bubble — mirrors the terminal's optional/collapsed reasoning display.
          if (event.channel === "content") {
            accumulated.content += event.text
            throttle.request(renderCurrent)
          }
          continue
        }

        if (event.type === "usage") continue

        state.events.push(event)

        const done = await handleFinalizedEvent(chatId, state, accumulated, throttle, editIfChanged, event)
        if (done) return
      }
    } catch (error) {
      log.warn("Telegram agent run failed", { error })
      const { category, message } = categorizeError(error)
      state.events.push({ type: "error", text: message, category })
      if (images.length > 0) {
        // The session lives on in memory: without this, every later turn would send the photo again
        dropImages(state.session, turnStart)
        if (isImageRejection(error)) return void (await editIfChanged(t("telegram.noVision")))
      }
      await editIfChanged(`⚠ ${category}: ${message}`)
    } finally {
      state.busy = false
      await persistSession(userId, state)
    }
  }

  /** `images` (data URLs): a photo sent with the message, whose caption is `text`; it always runs as a turn, never a command. */
  async function handleMessage(userId: number, chatId: number, text: string, images: string[] = []) {
    if (images.length > 0) return handlePhoto(userId, chatId, text, images)

    if (isCommand(text, "abilities")) {
      await sender.sendMessage(chatId, abilitiesMessage(agentConfig.tools ?? [], personas))
      return
    }

    if (isCommand(text, "new")) {
      const existing = users.get(userId)
      if (existing?.busy) {
        await sender.sendMessage(chatId, t("telegram.stillWorking"))
        return
      }
      const state = await createUserState(userId, false)
      users.set(userId, state)
      await sender.sendMessage(chatId, t("telegram.newSession"))
      return
    }

    const state = await getUserState(userId)

    if (state.busy) {
      await sender.sendMessage(chatId, t("telegram.stillWorking"))
      return
    }
    if (state.pendingCommand) {
      await sender.sendMessage(chatId, t("telegram.pendingCommand"))
      return
    }

    const focus = commandArgument(text, "compact")
    if (focus !== undefined) {
      await compactNow(userId, chatId, state, focus)
      return
    }

    await runTurn(userId, chatId, state, text, true)
  }

  async function handlePhoto(userId: number, chatId: number, caption: string, images: string[]) {
    const state = await getUserState(userId)
    if (state.busy) return void (await sender.sendMessage(chatId, t("telegram.stillWorking")))
    if (state.pendingCommand) return void (await sender.sendMessage(chatId, t("telegram.pendingCommand")))
    await runTurn(userId, chatId, state, caption, true, images)
  }

  // `/compact [focus]`: summarises this user's conversation now instead of running a turn.
  async function compactNow(userId: number, chatId: number, state: UserState, focus: string) {
    state.busy = true
    try {
      const result = await compact(state.agent, state.session, focus || undefined)
      if (result) state.events.push({ type: "compacted", ...result })
      await sender.sendMessage(chatId, result ? compactedLine(result) : t("telegram.nothingToCompact"))
    } catch (error) {
      log.warn("Telegram compaction failed", { error })
      await sender.sendMessage(chatId, t("telegram.genericError"))
    } finally {
      state.busy = false
      await persistSession(userId, state)
    }
  }

  async function handleCallbackQuery(
    userId: number,
    chatId: number,
    messageId: number,
    data: string,
    callbackQueryId: string
  ) {
    // Ack immediately regardless of outcome — Telegram shows a client-side spinner on the pressed button until this call resolves.
    await sender.answerCallbackQuery(callbackQueryId)
    const match = /^(cmd|tool):(approve|decline):(.+)$/.exec(data)
    if (!match) return
    const kind = match[1] === "cmd" ? "command" : "tool"
    const action = match[2] as "approve" | "decline"
    const token = match[3]!

    const state = await getUserState(userId)
    const pendingId = kind === "command" ? state.session.pendingRunCommandId : state.session.pendingToolApprovalId
    // The pressing user's id comes from the callback source (grammy: ctx.from.id), never from the payload, so this can only ever check against *that same user's* pendingCommand — even a leaked/guessed callback_data from another user's session can't cross over.
    if (state.pendingCommand?.kind !== kind || pendingId !== token) {
      await editSafely(chatId, messageId, t("telegram.commandExpired"), {
        replyMarkup: []
      })
      return
    }

    const pendingCommand = state.pendingCommand
    state.pendingCommand = undefined
    const approved = action === "approve"
    const statusLine = approved ? `✅ ${t("telegram.approved")}` : `❌ ${t("telegram.declined")}`
    await editSafely(chatId, pendingCommand.messageId, `${pendingCommand.body}\n\n${statusLine}`, { replyMarkup: [] })

    let result: string
    const startedAt = performance.now()
    if (pendingCommand.kind === "command") {
      result = approved ? await runShellCommand(pendingCommand.command) : "User declined to run this command."
      recordPausedCall(state.session, "run_command", approved ? { status: "ok", startedAt } : "declined")
    } else {
      let status: "ok" | "error" = "ok"
      result = approved
        ? await runApprovedTool(state.agent.tools, pendingCommand.name, pendingCommand.arguments, s => {
            status = s
          })
        : "User declined this request."
      recordPausedCall(state.session, "tool_approval", approved ? { status, startedAt } : "declined")
    }
    // showUserEvent = false: the synthesized shell result isn't something the human typed, so it drives the next turn without rendering as if they said it — matches hooks/use-agent.ts's resolveCommand.
    await runTurn(userId, chatId, state, result, false)
  }

  return { handleMessage, handleCallbackQuery }
}
