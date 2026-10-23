import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import {
  type AgentEvent,
  allowKey,
  applyVisionPin,
  compact,
  dataUrlBytes,
  dropImages,
  type FinalizedAgentEvent,
  imageRefId,
  isImageRejection,
  notApprovedPrompt,
  pendingQuestionOptions,
  personaAbilities,
  photoLabel,
  type PromptImage,
  recordPausedCall,
  runApprovedTool,
  samplingOf,
  toolName
} from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { telegramOwner } from "@kaja/schema/store"
import { isPublicHttpUrl } from "@kaja/shared/net"
import {
  approvalToken,
  askButtons,
  commandArgument,
  compactedLine,
  escapeHtml,
  isCommand,
  openReply,
  parseAskCallback,
  renderTelegramHtml,
  type Reply,
  type ReplyButton
} from "@kaja/shared/telegram"
import { sessionTitle } from "@kaja/shared/text"
import type { TimelineEvent } from "../../hooks/use-agent"
import { Agent, createSession, run, type Session } from "../agent/agents"
import { isDangerousCommand } from "../agent/command-risk"
import { categorizeError } from "../agent/error-category"
import { runShellCommand } from "../agent/run-command"
import { timelineEvent } from "../agent/timeline"
import { getLanguage, t } from "../i18n"
import { withDescription } from "../image/rows"
import { log } from "../logger"
import { storedImagePath } from "../memory/store"
import type { Persona } from "../personas/personas"
import { createSessionRow, loadLatestSessionRowForOwner, updateSessionRow } from "../session/store"

/**
 * The /abilities reply: the abilities each persona uses (its `abilities` list), and how to change them (on the
 * computer: this bot reads the folder once, at start).
 */
function abilitiesMessage(personas: Persona[]): string {
  const lines = personas.map(persona => {
    const names = [...personaAbilities(persona).keys()].map(name => escapeHtml(name))
    const who = escapeHtml(persona.label)
    return names.length > 0
      ? t("telegram.abilitiesPersona", { persona: who, names: names.join(", ") })
      : t("telegram.abilitiesPersonaNone", { persona: who })
  })
  return [`<b>${t("telegram.abilitiesTitle")}</b>`, ...lines, "", t("telegram.abilitiesHint")].join("\n")
}

const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp)$/i

// This conversation's stored images: nasi places a reply's kaja-image: links at these files, which have no extension.
const isStoredImage = (path: string) => {
  const root = storedImagePath("images")
  return root !== undefined && path.startsWith(`${root}/`)
}

/**
 * Where a reply's `![alt](src)` photo comes from: a public URL, or an existing image file by absolute or `~/` path
 * (nothing else, so a reply can't upload an arbitrary file).
 */
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
  if (!path.startsWith("/")) return undefined
  // Resolved, so a "../" can't climb out of the images folder
  path = resolve(path)
  if (!(IMAGE_FILE.test(path) || isStoredImage(path)) || !existsSync(path)) return undefined
  return { path }
}

/** Photos whose caption a late description can still replace, per user. */
const MAX_CAPTIONED_PHOTOS = 32

/** Command preview cap, matching components/layout/confirm-command.tsx's terminal UI. */
const MAX_COMMAND_LINES = 6

/** The events after which the turn has nothing more to say. */
const ENDS_TURN = new Set<AgentEvent["type"]>(["ask_user", "final", "confirm_command", "confirm_tool"])

/**
 * A failure as the chat shows it: the category in the user's language, like the cloud bot and the terminal, then the
 * provider's own (technical) text, escaped for HTML.
 */
function errorLine(error: unknown): string {
  const { category, message } = categorizeError(error)
  const label = t(`error.${category}`)
  return `⚠ ${label}: ${escapeHtml(message)}`
}

const toKeyboard = (rows: ReplyButton[][] | undefined): InlineKeyboardLike | undefined =>
  rows?.map(row => row.map(({ text, data }) => ({ text, callback_data: data })))

/**
 * A minimal, structural inline-keyboard shape — not grammy's InlineKeyboard class — so this module has no grammy
 * dependency.
 */
export type InlineKeyboardLike = { text: string; callback_data: string }[][]

/**
 * Abstraction over the actual Telegram API calls, so the driver is testable without a live bot and has zero import of
 * grammy itself. lib/telegram-bot.ts implements this against the real bot.api, translating grammy's own errors (429s,
 * "message is not modified") at that boundary.
 */
export type TelegramSender = {
  sendMessage(chatId: number, text: string, opts?: { replyMarkup?: InlineKeyboardLike }): Promise<{ messageId: number }>
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { replyMarkup?: InlineKeyboardLike }
  ): Promise<void>
  deleteMessage(chatId: number, messageId: number): Promise<void>
  answerCallbackQuery(callbackQueryId: string, opts?: { text?: string }): Promise<void>
  /**
   * Sends a photo: a tool's stored image (bytes), a local file (a reply's Markdown image) or a remote URL
   * (display_image events).
   */
  sendPhoto(
    chatId: number,
    photo: { data: Uint8Array } | { path: string } | { url: string },
    opts?: { caption?: string }
  ): Promise<{ messageId: number }>
  /** Replaces a sent photo's caption (a tool image's alt text, once its description is written). */
  editCaption(chatId: number, messageId: number, caption: string): Promise<void>
}

export type TelegramDriverConfig = {
  /** Model/tools/instructions baseline every user's Agent is constructed with. */
  agentConfig: ConstructorParameters<typeof Agent>[0]
  personas: Persona[]
  models: CliResolvedModel[]
  /**
   * Fallback persona for a user with no resumable session (including a fresh /new); defaults to personas[0]. A getter
   * rather than a fixed Persona so /new can reflect a persona switched in the terminal _after_ the bot process started,
   * without needing a restart.
   */
  getInitialPersona?: () => Persona | undefined | Promise<Persona | undefined>
  sender: TelegramSender
  /**
   * Constructs the Agent for a newly-created UserState. Defaults to `new Agent(...)`; overridable so tests can
   * substitute a fake OpenAI-shaped client the same way tests/lib/agents.test.ts does, without going through the real
   * lib/openai.ts singleton Agent's constructor always pulls in.
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
  /**
   * Serializes saves the same way hooks/use-agent.ts's persistChainRef does, so a fast next turn can't race the row-id
   * assignment into a duplicate INSERT.
   */
  persistChain: Promise<void>
  pendingCommand: PendingCommand | undefined
  busy: boolean
  /** Settles once the running turn has finished and saved, so an approval tapped while it winds down waits for it. */
  idle: Promise<void>
  /** Tool images sent as photos, by ref, so a description written later can become the photo's caption. */
  photos: Map<string, number>
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
    applyVisionPin(agent, persona)

    return {
      agent,
      session: resumeRow ? resumeRow.session : createSession(),
      events: (resumeRow?.events as TimelineEvent[] | undefined) ?? [],
      sessionRowId: resumeRow?.id,
      persona,
      persistChain: Promise.resolve(),
      pendingCommand: undefined,
      photos: new Map(),
      busy: false,
      idle: Promise.resolve()
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
            title: sessionTitle(first.text)
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
  async function sendPhotoSafely(
    chatId: number,
    photo: { data: Uint8Array } | { path: string } | { url: string },
    caption?: string
  ) {
    try {
      return await sender.sendPhoto(chatId, photo, caption ? { caption } : undefined)
    } catch (error) {
      log.warn("Telegram photo send failed", { error })
    }
  }

  // A tool image's bytes: from the session's store, or the data URL it stayed as without one.
  async function toolImageBytes(state: UserState, ref: string): Promise<Uint8Array | undefined> {
    const id = imageRefId(ref)
    if (!id) return dataUrlBytes(ref)
    const store = state.agent.store
    if (!store || !state.session.id) return undefined
    return (await store.images(state.session.id).get(id))?.data
  }

  async function sendConfirmCommand(chatId: number, state: UserState, event: { command: string; description: string }) {
    const dangerous = isDangerousCommand(event.command)
    const lines = event.command.split("\n")
    const preview = lines.slice(0, MAX_COMMAND_LINES).join("\n")
    const hidden = lines.length - MAX_COMMAND_LINES
    const description = dangerous ? `⚠ ${event.description}` : event.description
    const body = [
      renderTelegramHtml(description),
      // As written: what's approved must be exactly what runs
      `<pre><code>$ ${escapeHtml(preview)}</code></pre>`,
      hidden > 0 ? t("confirmCommand.truncated", { count: hidden }) : undefined
    ]
      .filter(Boolean)
      .join("\n")

    // A hash of the call id the session already waits on: it correlates the tap, and fits the Bot API's 64-byte callback_data cap whatever the provider's ids look like
    const token = approvalToken(state.session.pendingRunCommandId!)
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
    // Same correlator as sendConfirmCommand
    const token = approvalToken(state.session.pendingToolApprovalId!)
    const keyboard: InlineKeyboardLike = [
      [
        { text: `✅ ${t("confirmCommand.yes")}`, callback_data: `tool:approve:${token}` },
        { text: `❌ ${t("confirmCommand.no")}`, callback_data: `tool:decline:${token}` }
      ],
      [{ text: `✅ ${t("telegram.approveSession")}`, callback_data: `tool:approve_session:${token}` }]
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
   * Handles one finalized (non-delta, non-usage) event within a turn's loop. Returns `true` once the event has ended
   * the turn (confirm_command, ask_user, final) so {@link runTurn} knows to stop iterating.
   */
  async function handleFinalizedEvent(
    chatId: number,
    state: UserState,
    reply: Reply,
    event: Exclude<FinalizedAgentEvent, { type: "usage" }>
  ): Promise<boolean> {
    switch (event.type) {
      case "message":
        await reply.endRound(event.content)
        return false

      case "compacted":
        await sender.sendMessage(chatId, compactedLine(event, t, getLanguage()))
        return false

      case "persona_switch": {
        // run() already mutated the agent via applyPersona — mirror it into UserState so persistSession writes the new persona id.
        const next = personas.find(p => p.id === event.personaId)
        if (next) state.persona = next
        return false
      }

      case "tool_image": {
        const data = await toolImageBytes(state, event.ref)
        const sent = data && (await sendPhotoSafely(chatId, { data }, event.alt))
        if (sent) {
          // Kept past the turn (a description can land on the next one), but only the latest few
          state.photos.delete(event.ref)
          state.photos.set(event.ref, sent.messageId)
          if (state.photos.size > MAX_CAPTIONED_PHOTOS) state.photos.delete(state.photos.keys().next().value!)
        }
        return false
      }

      case "image_described": {
        state.events = withDescription(state.events, event.ref, event.description)
        const messageId = state.photos.get(event.ref)
        if (messageId === undefined) return false
        try {
          await sender.editCaption(chatId, messageId, event.description)
        } catch (error) {
          log.warn("Telegram caption edit failed", { error })
        }
        return false
      }

      case "display_image":
        await sendPhotoSafely(chatId, { url: event.url }, event.alt)
        return false

      case "confirm_command":
        await reply.settle()
        await sendConfirmCommand(chatId, state, event)
        return true

      case "confirm_tool":
        await reply.settle()
        await sendConfirmTool(chatId, state, event)
        return true

      // The question is the round's whole text, its links already placed (a trailing "?" reply, or the ask_user call's own)
      case "ask_user":
        await reply.finish(event.question, event.id && event.options ? askButtons(event.id, event.options) : undefined)
        return true

      case "final":
        await reply.finish(event.content ?? "")
        return true

      // A delta (the caller's own are handled before they get here) ends nothing.
      default:
        return false
    }
  }

  /** Dispatches one finalized event, logging a failed send rather than stopping the run. Returns whether the turn ended. */
  async function dispatchFinalizedEvent(
    chatId: number,
    state: UserState,
    reply: Reply,
    event: Exclude<FinalizedAgentEvent, { type: "usage" }>
  ): Promise<boolean> {
    try {
      return await handleFinalizedEvent(chatId, state, reply, event)
    } catch (error) {
      log.warn("Telegram send failed", { error })
      if (!ENDS_TURN.has(event.type)) return false
      await reply.fail(errorLine(error))
      return true
    }
  }

  /** Reads a turn's events to the end: the reply as it streams, the timeline until the turn has ended. */
  async function readTurn(events: AsyncIterable<AgentEvent>, chatId: number, state: UserState, reply: Reply) {
    let ended = false
    for await (const event of events) {
      // Read to the end even after the reply is out: a tool image's description, written by then, still reaches its photo's caption.
      if (ended && event.type !== "image_described") continue
      if (event.type === "delta") {
        // Reasoning deltas are omitted from the live bubble — mirrors the terminal's optional/collapsed reasoning display.
        if (event.channel === "content") reply.append(event.text)
        continue
      }

      if (event.type === "usage") continue

      if (event.type !== "image_described") state.events.push(timelineEvent(event))

      // A failed send never stops the run: the session then stays whole
      if (await dispatchFinalizedEvent(chatId, state, reply, event)) ended = true
    }
  }

  /** Records a failed turn and returns what the reply should say instead. */
  function turnFailure(state: UserState, error: unknown, hadImages: boolean, turnStart: number): string {
    log.warn("Telegram agent run failed", { error })
    const { category, message } = categorizeError(error)
    state.events.push({ type: "error", text: message, category })
    const line = errorLine(error)
    if (!hadImages) return line
    // The session lives on in memory: without this, every later turn would send the photo again
    dropImages(state.session, turnStart)
    return isImageRejection(error) ? t("telegram.noVision") : line
  }

  /** `userText`: the timeline's line for what the human sent (none for an approval's result, which they didn't type). */
  async function runTurn(
    userId: number,
    chatId: number,
    state: UserState,
    prompt: string,
    userText: string | undefined,
    images: PromptImage[] = []
  ) {
    state.busy = true
    let finished = () => {}
    state.idle = new Promise(resolve => {
      finished = resolve
    })
    if (userText !== undefined) state.events.push({ type: "user", text: userText })
    const turnStart = state.session.messages.length

    try {
      const reply = await openReply({
        send: (text, rows) => sender.sendMessage(chatId, text, { replyMarkup: toKeyboard(rows) }),
        edit: (messageId, text, rows) =>
          sender.editMessageText(chatId, messageId, text, { replyMarkup: toKeyboard(rows) }),
        remove: messageId => sender.deleteMessage(chatId, messageId),
        sendPhoto: async (photo: { path: string } | { url: string }, caption) => {
          await sender.sendPhoto(chatId, photo, caption ? { caption } : undefined)
        },
        photoSource,
        emptyReply: t("telegram.emptyResponse"),
        warn: (message, error) => log.warn(message, { error })
      })
      try {
        await readTurn(run(state.agent, prompt, state.session, telegramOwner(userId), images), chatId, state, reply)
      } catch (error) {
        await reply.fail(turnFailure(state, error, images.length > 0, turnStart))
      }
    } finally {
      await persistSession(userId, state)
      state.busy = false
      finished()
    }
  }

  /**
   * A message instead of a tap on a waiting approval skips the call, like the cloud bot: the prompt says so, and the
   * approval's buttons go. Also after a restart, when only the session remembers the call.
   */
  async function answerPendingWith(chatId: number, state: UserState, text: string): Promise<string> {
    const kind = state.session.pendingRunCommandId ? "run_command" : "tool_approval"
    if (!state.session.pendingRunCommandId && !state.session.pendingToolApprovalId) return text
    const pending = state.pendingCommand
    state.pendingCommand = undefined
    recordPausedCall(state.session, kind, "skipped")
    if (pending)
      await editSafely(chatId, pending.messageId, `${pending.body}\n\n⏭ ${t("telegram.skipped")}`, { replyMarkup: [] })
    return notApprovedPrompt(text)
  }

  /**
   * `images` (data URLs): photos sent with the message, whose caption is `text`; they always run as a turn, never a
   * command.
   */
  async function handleMessage(userId: number, chatId: number, text: string, images: string[] = []) {
    if (images.length > 0) return handlePhoto(userId, chatId, text, images)

    // Telegram sends it when an owner opens the chat anew; a code in it only pairs strangers
    if (commandArgument(text, "start") !== undefined) {
      await sender.sendMessage(chatId, t("telegram.welcome"))
      return
    }

    if (isCommand(text, "abilities")) {
      await sender.sendMessage(chatId, abilitiesMessage(personas))
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

    const focus = commandArgument(text, "compact")
    if (focus !== undefined) {
      // Compacting would leave the waiting call without its answer
      if (state.pendingCommand) await sender.sendMessage(chatId, t("telegram.pendingCommand"))
      else await compactNow(userId, chatId, state, focus)
      return
    }

    await runTurn(userId, chatId, state, await answerPendingWith(chatId, state, text), text)
  }

  async function handlePhoto(userId: number, chatId: number, caption: string, images: string[]) {
    const state = await getUserState(userId)
    if (state.busy) {
      await sender.sendMessage(chatId, t("telegram.stillWorking"))
      return
    }
    const prompt = await answerPendingWith(chatId, state, caption)
    await runTurn(userId, chatId, state, prompt, photoLabel(caption), images)
  }

  // `/compact [focus]`: summarises this user's conversation now instead of running a turn.
  async function compactNow(userId: number, chatId: number, state: UserState, focus: string) {
    state.busy = true
    try {
      const result = await compact(state.agent, state.session, focus || undefined)
      if (result) state.events.push({ type: "compacted", ...result })
      await sender.sendMessage(
        chatId,
        result ? compactedLine(result, t, getLanguage()) : t("telegram.nothingToCompact")
      )
    } catch (error) {
      log.warn("Telegram compaction failed", { error })
      await sender.sendMessage(chatId, t("telegram.genericError"))
    } finally {
      state.busy = false
      await persistSession(userId, state)
    }
  }

  /** Runs the approved/declined command or tool, recording it on the session. */
  async function runApprovalAction(
    state: UserState,
    pendingCommand: PendingCommand,
    approved: boolean,
    action: "approve" | "approve_session" | "decline"
  ): Promise<{ result: string; images: PromptImage[] }> {
    const startedAt = performance.now()
    if (pendingCommand.kind === "command") {
      const result = approved ? await runShellCommand(pendingCommand.command) : "User declined to run this command."
      recordPausedCall(state.session, "run_command", approved ? { status: "ok", startedAt } : "declined")
      return { result, images: [] }
    }

    if (action === "approve_session") grantForSession(state, pendingCommand.name)
    let status: "ok" | "error" = "ok"
    const ran = approved
      ? await runApprovedTool(state.agent.tools, pendingCommand.name, pendingCommand.arguments, s => {
          status = s
        })
      : { text: "User declined this request.", images: [] }
    recordPausedCall(state.session, "tool_approval", approved ? { status, startedAt } : "declined")
    return { result: ran.text, images: ran.images }
  }

  /**
   * A tap on one of a question's options: it must be the question the session still waits on, so an old button only
   * says so. The message keeps the question and shows the pick, which then is the user's answer.
   */
  async function answerQuestion(
    userId: number,
    chatId: number,
    messageId: number,
    answer: { token: string; index: number },
    messageText?: string
  ) {
    const state = await getUserState(userId)
    // The turn that sent the question may still be finishing (saving, waiting on an image's description)
    await state.idle
    const askId = state.session.pendingAskUserId
    const choice = pendingQuestionOptions(state.session)[answer.index]
    const question = messageText ? `${escapeHtml(messageText)}\n\n` : ""
    if (state.busy || !askId || approvalToken(askId) !== answer.token || choice === undefined) {
      await editSafely(chatId, messageId, `${question}${t("telegram.questionExpired")}`, { replyMarkup: [] })
      return
    }
    // The turn starts (and marks the user busy) before the edit is awaited, so a second tap can't answer it again
    const marked = editSafely(chatId, messageId, `${question}→ ${escapeHtml(choice)}`, { replyMarkup: [] })
    await Promise.all([marked, runTurn(userId, chatId, state, choice, choice)])
  }

  async function handleCallbackQuery(
    userId: number,
    chatId: number,
    messageId: number,
    data: string,
    callbackQueryId: string,
    messageText?: string
  ) {
    // Ack immediately regardless of outcome — Telegram shows a client-side spinner on the pressed button until this call resolves.
    await sender.answerCallbackQuery(callbackQueryId)
    const answer = parseAskCallback(data)
    if (answer) return answerQuestion(userId, chatId, messageId, answer, messageText)
    const match = /^(cmd|tool):(approve|approve_session|decline):(.+)$/.exec(data)
    if (!match) return
    const kind = match[1] === "cmd" ? "command" : "tool"
    const action = match[2] as "approve" | "approve_session" | "decline"
    const token = match[3]!

    const state = await getUserState(userId)
    // The turn that sent the prompt may still be finishing (saving, waiting on an image's description)
    await state.idle
    const pendingId = kind === "command" ? state.session.pendingRunCommandId : state.session.pendingToolApprovalId
    // The pressing user's id comes from the callback source (grammy: ctx.from.id), never from the payload, so this can only ever check against *that same user's* pendingCommand — even a leaked/guessed callback_data from another user's session can't cross over.
    if (state.busy || state.pendingCommand?.kind !== kind || !pendingId || approvalToken(pendingId) !== token) {
      await editSafely(chatId, messageId, t("telegram.commandExpired"), {
        replyMarkup: []
      })
      return
    }

    const pendingCommand = state.pendingCommand
    state.pendingCommand = undefined
    // Busy from the tap on: a message sent while the command runs mustn't start a turn beside it
    state.busy = true
    const approved = action !== "decline"
    const statusLine = approved ? `✅ ${t("telegram.approved")}` : `❌ ${t("telegram.declined")}`
    await editSafely(chatId, pendingCommand.messageId, `${pendingCommand.body}\n\n${statusLine}`, { replyMarkup: [] })

    let result: string
    let images: PromptImage[]
    try {
      ;({ result, images } = await runApprovalAction(state, pendingCommand, approved, action))
    } catch (error) {
      state.busy = false
      throw error
    }
    // No user line: the synthesized result isn't something the human typed, so it drives the next turn without rendering as if they said it — matches hooks/use-agent.ts's resolveCommand.
    await runTurn(userId, chatId, state, result, undefined, images)
  }

  /** "Approve for this chat": the tool stops asking for the rest of this session, as in the cloud. */
  function grantForSession(state: UserState, name: string) {
    const approved = state.agent.tools.find(candidate => toolName(candidate) === name)
    const key = approved && allowKey(approved)
    if (key) state.session.grantedTools = [...new Set([...(state.session.grantedTools ?? []), key])]
  }

  return { handleMessage, handleCallbackQuery }
}
