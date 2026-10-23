import {
  type AgentEvent,
  categorizeError,
  dataUrlBytes,
  type FinalizedAgentEvent,
  isImageRejection,
  type NasiTurnInput,
  pendingQuestionOptions,
  pendingToolCall,
  TELEGRAM_CHANNEL_INSTRUCTION
} from "@kaja/nasi"
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
  type Reply
} from "@kaja/shared/telegram"
import { pool } from "../../core/db"
import { imageUrl, objects } from "../../core/files"
import type { Translate } from "../../core/i18n"
import { withLock } from "../../core/lock"
import { reportError } from "../../core/report"
import { openNasiFor } from "../nasi/chat"
import { createPostgresStore } from "../nasi/pg-store"
import { type BotLanguage, botLanguage } from "./language"

const TOOL_CALLBACK = /^tool:(approve|approve_session|decline):([0-9a-f]{16})$/

/** One inline button: its label and the callback data it sends back. */
export type TelegramButton = { text: string; data: string }

/**
 * Abstraction over the actual Telegram API calls, so the driver has zero import of grammy itself. bot.ts implements
 * this against the real bot.api, translating grammy's own errors (429s, "message is not modified") at that boundary.
 * Buttons (rows of them) serve tool approvals (`confirm_tool`); cloud Nasi never emits confirm_command. Editing a
 * message without `rows` removes its buttons.
 */
export type TelegramSender = {
  sendMessage(chatId: number, text: string, rows?: TelegramButton[][]): Promise<{ messageId: number }>
  editMessageText(chatId: number, messageId: number, text: string, rows?: TelegramButton[][]): Promise<void>
  deleteMessage(chatId: number, messageId: number): Promise<void>
  /** Sends a photo by URL (Telegram fetches it) or as the image's bytes, with an optional plain-text caption. */
  sendPhoto(chatId: number, photo: string | Uint8Array, caption?: string): Promise<{ messageId: number }>
  /** Replaces a sent photo's caption (a tool image's alt text, once its description is written). */
  editCaption(chatId: number, messageId: number, caption: string): Promise<void>
}

export type CloudTelegramDriverConfig = {
  /** Resolves a Telegram user id to the Kaja account it's linked to (with its saved language), or undefined if unlinked. */
  resolveLinkedUser: (telegramUserId: number) => Promise<{ userId: string; locale: string | null } | undefined>
  sender: TelegramSender
}

/** An account's latest conversation with one Telegram user. */
function loadLatestSession(userId: string, owner: string) {
  return createPostgresStore(pool, userId).loadLatestSession(owner)
}

/** The events after which the turn has nothing more to say. */
const ENDS_TURN = new Set<AgentEvent["type"]>(["ask_user", "final", "confirm_tool"])

/** A failure as the chat shows it: the category in the user's language, then the (technical) detail, escaped for HTML. */
function errorLine(error: unknown, t: Translate): string {
  const { category, message } = categorizeError(error)
  const label = t(`telegram.error.${category}`)
  return `⚠ ${label}: ${escapeHtml(message)}`
}

/**
 * Cloud counterpart to apps/tui/lib/telegram/driver.ts. Each Telegram user must link their own Kaja account first (see
 * bot.ts's /start handler); the owning `userId` is resolved fresh per message via `resolveLinkedUser`, never fixed.
 * `telegramOwner(userId)` is still used as the `owner` within that account's Postgres partition, so a linked user's bot
 * conversations stay separate from their web/lite ones (same mechanism widget visitors use — see runWidgetTurn). No
 * per-user Agent cache: `openNasiFor` is called fresh per turn, same as every HTTP /nasi/turn call — state round-trips
 * through Postgres via the session id instead of living in memory.
 */
export function createCloudTelegramDriver(config: CloudTelegramDriverConfig) {
  const { resolveLinkedUser, sender } = config
  // Marks a Telegram user's next message as "don't resume" after /new, and who has a turn running (a message
  // then gets "still working"). No other in-memory state exists — session content always round-trips through Postgres.
  const forceNew = new Set<number>()
  // A count, since an approval can be waiting on the lock while a turn finishes
  const busy = new Map<string, number>()

  async function editSafely(chatId: number, messageId: number, text: string, rows?: TelegramButton[][]) {
    try {
      await sender.editMessageText(chatId, messageId, text, rows)
    } catch (error) {
      console.warn("Telegram edit failed", { error })
    }
  }

  /** Runs `work` with the user marked busy, under the per-user lock that serialises their turns. */
  async function whileBusy<T>(owner: string, work: () => Promise<T>): Promise<T> {
    busy.set(owner, (busy.get(owner) ?? 0) + 1)
    try {
      return await withLock(`telegram:${owner}`, work)
    } finally {
      const left = busy.get(owner)! - 1
      if (left > 0) busy.set(owner, left)
      else busy.delete(owner)
    }
  }

  /**
   * A tool's image as a photo: by its public URL, or as bytes when Telegram can't fetch that (the local dev storage,
   * say); a failed send is logged, never ends the turn.
   */
  async function sendToolImage(chatId: number, image: { ref: string; key?: string; alt: string }) {
    try {
      if (image.key && isPublicHttpUrl(imageUrl(image.key)))
        return await sender.sendPhoto(chatId, imageUrl(image.key), image.alt)
      const bytes = image.key ? await objects.get(image.key) : dataUrlBytes(image.ref)
      if (bytes) return await sender.sendPhoto(chatId, bytes, image.alt)
    } catch (error) {
      console.warn("Telegram tool image send failed", { error })
    }
  }

  /** A tool image's description, written after its photo went out, becomes the photo's caption. */
  async function describePhoto(chatId: number, messageId: number | undefined, description: string) {
    if (messageId === undefined) return
    try {
      await sender.editCaption(chatId, messageId, description)
    } catch (error) {
      console.warn("Telegram caption edit failed", { error })
    }
  }

  /**
   * Shows a tool call waiting for approval, with Approve/Decline buttons; any text the model wrote first stays above
   * it.
   */
  async function sendApproval(
    reply: Reply,
    chatId: number,
    event: Extract<FinalizedAgentEvent, { type: "confirm_tool" }>,
    language: BotLanguage
  ) {
    const { t } = language
    const text = [
      t("telegram.toolWantsToRun", { name: escapeHtml(event.name) }),
      `<pre><code>${escapeHtml(event.summary)}</code></pre>`
    ]
    const token = approvalToken(event.id)
    const buttons = [
      [
        { text: t("telegram.approve"), data: `tool:approve:${token}` },
        { text: t("telegram.decline"), data: `tool:decline:${token}` }
      ],
      [{ text: t("telegram.approveSession"), data: `tool:approve_session:${token}` }]
    ]
    await reply.settle()
    await sender.sendMessage(chatId, text.join("\n"), buttons)
  }

  /**
   * Handles one event; ask_user, confirm_tool and final end the turn. A tool image (an MCP screenshot) goes out as a
   * photo; local-only events (display_image, confirm_command) are ignored — cloud Nasi never emits them.
   */
  async function handleFinalizedEvent(
    reply: Reply,
    chatId: number,
    event: FinalizedAgentEvent,
    language: BotLanguage,
    photos: Map<string, number>
  ): Promise<void> {
    if (event.type === "message") await reply.endRound(event.content)
    // The question is the round's whole text, its links already placed (a trailing "?" reply, or the ask_user call's own)
    else if (event.type === "ask_user") await reply.finish(event.question, askButtons(event.id, event.options))
    else if (event.type === "final") await reply.finish(event.content ?? "")
    else if (event.type === "confirm_tool") await sendApproval(reply, chatId, event, language)
    else if (event.type === "compacted")
      await sender.sendMessage(chatId, compactedLine(event, language.t, language.locale))
    else if (event.type === "tool_image") {
      const sent = await sendToolImage(chatId, event)
      if (sent) photos.set(event.ref, sent.messageId)
    } else if (event.type === "image_described") await describePhoto(chatId, photos.get(event.ref), event.description)
  }

  /** `/compact [focus]`: summarises the user's latest conversation now, under the same per-user lock as turns. */
  function compactNow(
    ownerUserId: string,
    owner: string,
    chatId: number,
    focus: string,
    resume: boolean,
    language: BotLanguage
  ) {
    const { t } = language
    return whileBusy(owner, async () => {
      try {
        const latest = resume ? await loadLatestSession(ownerUserId, owner) : undefined
        if (!latest) {
          await sender.sendMessage(chatId, t("telegram.nothingToCompact"))
          return
        }
        const nasi = await openNasiFor({ userId: ownerUserId, owner, pinnedModel: latest.model })
        try {
          const result = await nasi.compact(latest.id, focus || undefined)
          await sender.sendMessage(
            chatId,
            result ? compactedLine(result, t, language.locale) : t("telegram.nothingToCompact")
          )
        } finally {
          await nasi.close()
        }
      } catch (error) {
        reportError("Telegram compaction failed", error)
        await sender.sendMessage(chatId, errorLine(error, t)).catch(() => {})
      }
    })
  }

  /**
   * Dispatches one finalized event, logging a failed send rather than stopping the turn. Returns whether the turn
   * ended.
   */
  async function dispatchFinalizedEvent(
    reply: Reply,
    chatId: number,
    event: FinalizedAgentEvent,
    language: BotLanguage,
    photos: Map<string, number>
  ): Promise<boolean> {
    try {
      await handleFinalizedEvent(reply, chatId, event, language, photos)
    } catch (error) {
      console.warn("Telegram send failed", { error })
      if (!ENDS_TURN.has(event.type)) return false
      await reply.fail(errorLine(error, language.t))
      return true
    }
    return ENDS_TURN.has(event.type)
  }

  /**
   * Reads a turn's events to the end, handling each as it arrives. A failed send never stops it: the turn is saved only
   * once its events have all been read.
   */
  async function readTurn(
    turn: AsyncIterable<AgentEvent>,
    chatId: number,
    reply: Reply,
    language: BotLanguage
  ): Promise<void> {
    let ended = false
    const photos = new Map<string, number>()
    for await (const event of turn) {
      // Read to the end after the reply too: the turn saves when the generator finishes, and late descriptions caption photos
      if (ended && event.type !== "image_described") continue
      if (event.type === "delta") {
        if (event.channel === "content") reply.append(event.text)
        continue
      }
      if (event.type === "usage") continue
      if (await dispatchFinalizedEvent(reply, chatId, event, language, photos)) ended = true
    }
  }

  async function runTurnLocked(
    ownerUserId: string,
    owner: string,
    chatId: number,
    input: Pick<NasiTurnInput, "message" | "approval" | "images">,
    resume: boolean,
    language: BotLanguage
  ) {
    const reply = await openReply({
      send: (text, rows) => sender.sendMessage(chatId, text, rows),
      edit: (messageId, text, rows) => sender.editMessageText(chatId, messageId, text, rows),
      remove: messageId => sender.deleteMessage(chatId, messageId),
      sendPhoto: async (url: string, caption) => {
        await sender.sendPhoto(chatId, url, caption)
      },
      // Public URLs only, never a server path (nasi has placed this conversation's images at theirs)
      photoSource: src => (isPublicHttpUrl(src) ? src : undefined),
      emptyReply: language.t("telegram.emptyResponse"),
      warn: (message, error) => console.warn(message, { error })
    })

    try {
      const resumeRow = resume ? await loadLatestSession(ownerUserId, owner) : undefined
      const nasi = await openNasiFor({
        userId: ownerUserId,
        owner,
        pinnedModel: resumeRow?.model,
        language: language.locale,
        channelInstruction: TELEGRAM_CHANNEL_INSTRUCTION
      })
      try {
        await readTurn(nasi.turn({ session: resumeRow?.id, ...input }), chatId, reply, language)
      } finally {
        await nasi.close()
      }
    } catch (error) {
      console.warn("Telegram agent turn failed", { error })
      // A failed turn isn't saved, so the photo doesn't linger in the session; only the reply needs saying
      if (input.images?.length && isImageRejection(error)) {
        await reply.fail(language.t("telegram.noVision"))
        return
      }
      await reply.fail(errorLine(error, language.t))
    }
  }

  /**
   * `telegramLanguage` is the sender's Telegram app language, used only when their account has none saved. `images`
   * (data URLs, with a sent file's name): photos sent with the message, whose caption is `text`; they always run as a
   * turn, never a command.
   */
  async function handleMessage(
    telegramUserId: number,
    chatId: number,
    text: string,
    telegramLanguage?: string,
    images: NonNullable<NasiTurnInput["images"]> = []
  ) {
    const linked = await resolveLinkedUser(telegramUserId)
    const language = botLanguage(linked?.locale, telegramLanguage)
    const { t } = language
    if (!linked) {
      await sender.sendMessage(chatId, t("telegram.notLinked"))
      return
    }
    const ownerUserId = linked.userId

    const owner = telegramOwner(telegramUserId)

    if (images.length === 0 && isCommand(text, "new")) {
      forceNew.add(telegramUserId)
      await sender.sendMessage(chatId, t("telegram.newSession"))
      return
    }

    if (busy.has(owner)) {
      await sender.sendMessage(chatId, t("telegram.stillWorking"))
      return
    }

    const focus = images.length === 0 ? commandArgument(text, "compact") : undefined
    if (focus !== undefined) {
      // After /new there's no conversation to compact yet, and the next message still starts a fresh one.
      await compactNow(ownerUserId, owner, chatId, focus, !forceNew.has(telegramUserId), language)
      return
    }

    const resume = !forceNew.delete(telegramUserId)
    try {
      await whileBusy(owner, () =>
        runTurnLocked(ownerUserId, owner, chatId, { message: text, images }, resume, language)
      )
    } catch (error) {
      reportError("Telegram turn crashed", error)
    }
  }

  /**
   * A tap on one of a question's options: it must be the question their latest session is still waiting on, so an old
   * button does nothing but say so. The message keeps the question and shows the pick, then the pick is the user's
   * answer.
   */
  async function answerQuestion(
    ownerUserId: string,
    owner: string,
    chatId: number,
    messageId: number,
    answer: { token: string; index: number },
    language: BotLanguage,
    messageText?: string
  ) {
    const { t } = language
    const question = messageText ? `${escapeHtml(messageText)}\n\n` : ""
    try {
      await whileBusy(owner, async () => {
        const row = await loadLatestSession(ownerUserId, owner)
        const askId = row?.session.pendingAskUserId
        const choice = row ? pendingQuestionOptions(row.session)[answer.index] : undefined
        if (!askId || approvalToken(askId) !== answer.token || choice === undefined) {
          await editSafely(chatId, messageId, `${question}${t("telegram.questionExpired")}`)
          return
        }
        await editSafely(chatId, messageId, `${question}→ ${escapeHtml(choice)}`)
        await runTurnLocked(ownerUserId, owner, chatId, { message: choice }, true, language)
      })
    } catch (error) {
      reportError("Telegram answer crashed", error)
    }
  }

  /**
   * A button press: Approve/Decline on a tool call. The pressing user comes from Telegram (never the payload). An
   * approval must match the call their latest session is still waiting on, so an old or foreign button does nothing;
   * the server then runs (or skips) the call it saved. `messageText` is the prompt's own text, kept above the answer.
   * Returns false for callback data that isn't ours.
   */
  async function handleCallback(
    telegramUserId: number,
    chatId: number,
    messageId: number,
    data: string,
    telegramLanguage?: string,
    messageText?: string
  ) {
    const answer = parseAskCallback(data)
    const match = TOOL_CALLBACK.exec(data)
    if (!match && !answer) return false
    const linked = await resolveLinkedUser(telegramUserId)
    const language = botLanguage(linked?.locale, telegramLanguage)
    const { t } = language
    if (!linked) {
      await sender.sendMessage(chatId, t("telegram.notLinked"))
      return true
    }
    const ownerUserId = linked.userId

    const owner = telegramOwner(telegramUserId)
    if (answer) {
      await answerQuestion(ownerUserId, owner, chatId, messageId, answer, language, messageText)
      return true
    }
    if (!match) return false
    const approval = match[1] as "approve" | "approve_session" | "decline"

    try {
      await whileBusy(owner, async () => {
        const row = await loadLatestSession(ownerUserId, owner)
        const session = row?.session
        const pendingId = session?.pendingToolApprovalId
        const call = session && pendingId ? pendingToolCall(session, pendingId) : undefined
        if (!call || approvalToken(pendingId!) !== match[2]) {
          await editSafely(chatId, messageId, t("telegram.approvalExpired"))
          return
        }
        const status = approval === "decline" ? t("telegram.declined") : t("telegram.approved")
        const prompt = messageText ? escapeHtml(messageText) : `🔐 <b>${escapeHtml(call.function.name)}</b>`
        await editSafely(chatId, messageId, `${prompt}\n\n${status}`)
        await runTurnLocked(ownerUserId, owner, chatId, { approval }, true, language)
      })
    } catch (error) {
      reportError("Telegram approval crashed", error)
    }
    return true
  }

  return { handleMessage, handleCallback }
}
