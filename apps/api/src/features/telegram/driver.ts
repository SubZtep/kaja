import { createHash } from "node:crypto"
import {
  categorizeError,
  dataUrlBytes,
  type FinalizedAgentEvent,
  imageKey,
  imageRefId,
  isImageRejection,
  type NasiTurnInput,
  pendingToolCall,
  sessionImagePrefix,
  TELEGRAM_CHANNEL_INSTRUCTION
} from "@kaja/nasi"
import { telegramOwner } from "@kaja/schema/store"
import { isPublicHttpUrl } from "@kaja/shared/net"
import { commandArgument, compactedLine, escapeHtml, isCommand, openReply, type Reply } from "@kaja/shared/telegram"
import { withQuestion } from "@kaja/shared/text"
import { pool } from "../../core/db"
import { imageUrl, objects } from "../../core/files"
import type { Translate } from "../../core/i18n"
import { withLock } from "../../core/lock"
import { reportError } from "../../core/report"
import { openNasiFor, pinnedModelFor } from "../nasi/chat"
import { createPostgresStore } from "../nasi/pg-store"
import { type BotLanguage, botLanguage } from "./language"

const TOOL_CALLBACK = /^tool:(approve|approve_session|decline):([0-9a-f]{16})$/

/** Short, fixed-length stand-in for a pending call id in callback data (the Bot API caps it at 64 bytes; provider call ids vary in length). */
function approvalToken(callId: string): string {
  return createHash("sha256").update(callId).digest("hex").slice(0, 16)
}

/** One inline button: its label and the callback data it sends back. */
export type TelegramButton = { text: string; data: string }

/**
 * Abstraction over the actual Telegram API calls, so the driver has zero
 * import of grammy itself. bot.ts implements this against the real bot.api,
 * translating grammy's own errors (429s, "message is not modified") at that
 * boundary. Buttons (rows of them) serve tool approvals (`confirm_tool`);
 * cloud Nasi never emits confirm_command. Editing a
 * message without `rows` removes its buttons.
 */
export type TelegramSender = {
  sendMessage(chatId: number, text: string, rows?: TelegramButton[][]): Promise<{ messageId: number }>
  editMessageText(chatId: number, messageId: number, text: string, rows?: TelegramButton[][]): Promise<void>
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

/**
 * Cloud counterpart to apps/tui/lib/telegram/driver.ts. Each Telegram user
 * must link their own Kaja account first (see bot.ts's /start handler); the
 * owning `userId` is resolved fresh per message via `resolveLinkedUser`,
 * never fixed. `telegramOwner(userId)` is still used as the `owner` within
 * that account's Postgres partition, so a linked user's bot conversations
 * stay separate from their web/lite ones (same mechanism widget visitors
 * use — see runWidgetTurn). No per-user Agent cache: `openNasiFor` is
 * called fresh per turn, same as every HTTP /nasi/turn call — state
 * round-trips through Postgres via the session id instead of living in
 * memory.
 */
export function createCloudTelegramDriver(config: CloudTelegramDriverConfig) {
  const { resolveLinkedUser, sender } = config
  // Marks a Telegram user's next message as "don't resume" after /new. No other in-memory
  // state exists — session content itself always round-trips through Postgres.
  const forceNew = new Set<number>()

  async function editSafely(chatId: number, messageId: number, text: string, rows?: TelegramButton[][]) {
    try {
      await sender.editMessageText(chatId, messageId, text, rows)
    } catch (error) {
      console.warn("Telegram edit failed", { error })
    }
  }

  /** A tool's image as a photo: by its public URL, or as bytes when Telegram can't fetch that (the local dev storage, say); a failed send is logged, never ends the turn. */
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

  /** Shows a tool call waiting for approval, with Approve/Decline buttons; any text the model wrote first stays in the placeholder. */
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

  /** Returns true once the event has ended the turn (ask_user, confirm_tool, final) so runTurn ignores anything after it. A tool image (an MCP screenshot) goes out as a photo; local-only events (display_image, confirm_command) are ignored — cloud Nasi never emits them. */
  async function handleFinalizedEvent(
    reply: Reply,
    chatId: number,
    event: FinalizedAgentEvent,
    language: BotLanguage,
    photos: Map<string, number>
  ): Promise<boolean> {
    if (event.type === "ask_user") {
      await reply.finish(withQuestion(reply.streamed, event.question))
      return true
    }
    if (event.type === "final") {
      await reply.finish(event.content ?? "")
      return true
    }
    if (event.type === "confirm_tool") {
      await sendApproval(reply, chatId, event, language)
      return true
    }
    if (event.type === "compacted") await sender.sendMessage(chatId, compactedLine(event, language.t))
    else if (event.type === "tool_image") {
      const sent = await sendToolImage(chatId, event)
      if (sent) photos.set(event.ref, sent.messageId)
    } else if (event.type === "image_described") await describePhoto(chatId, photos.get(event.ref), event.description)
    return false
  }

  /** `/compact [focus]`: summarises the user's latest conversation now, under the same per-user lock as turns. */
  function compactNow(
    ownerUserId: string,
    owner: string,
    chatId: number,
    focus: string,
    resume: boolean,
    t: Translate
  ) {
    return withLock(`telegram:${owner}`, async () => {
      try {
        const latest = resume ? await createPostgresStore(pool, ownerUserId).loadLatestSession(owner) : undefined
        if (!latest) {
          await sender.sendMessage(chatId, t("telegram.nothingToCompact"))
          return
        }
        const nasi = await openNasiFor({ userId: ownerUserId, owner, pinnedModel: latest.model })
        try {
          const result = await nasi.compact(latest.id, focus || undefined)
          await sender.sendMessage(chatId, result ? compactedLine(result, t) : t("telegram.nothingToCompact"))
        } finally {
          await nasi.close()
        }
      } catch (error) {
        reportError("Telegram compaction failed", error)
        const { category, message } = categorizeError(error)
        const label = t(`telegram.error.${category}`)
        await sender.sendMessage(chatId, `⚠ ${label}: ${message}`)
      }
    })
  }

  // Serializes turns per Telegram user, mirroring nasi/chat.ts's withSessionLock — without it,
  // two rapid messages from the same user could both resolve the same "latest session" and race
  // its persistence.
  function runTurn(
    ownerUserId: string,
    owner: string,
    chatId: number,
    prompt: string,
    resume: boolean,
    language: BotLanguage,
    images?: string[]
  ) {
    return withLock(`telegram:${owner}`, () =>
      runTurnLocked(ownerUserId, owner, chatId, { message: prompt, images }, resume, language)
    )
  }

  async function runTurnLocked(
    ownerUserId: string,
    owner: string,
    chatId: number,
    input: Pick<NasiTurnInput, "message" | "approval" | "images">,
    resume: boolean,
    language: BotLanguage
  ) {
    // The turn's session, once Nasi has it: a reply's kaja-image: links are its images.
    let sessionId: string | undefined
    const reply = await openReply({
      send: text => sender.sendMessage(chatId, text),
      edit: (messageId, text) => sender.editMessageText(chatId, messageId, text),
      sendPhoto: async (url: string, caption) => {
        await sender.sendPhoto(chatId, url, caption)
      },
      // Public URLs only, never a server path; an image of this conversation by its link, at its public URL
      photoSource: src => {
        const id = imageRefId(src)
        const url = id && sessionId ? imageUrl(imageKey(sessionImagePrefix(sessionId, ownerUserId), id)) : src
        return isPublicHttpUrl(url) ? url : undefined
      },
      emptyReply: language.t("telegram.emptyResponse"),
      warn: (message, error) => console.warn(message, { error })
    })

    try {
      const store = createPostgresStore(pool, ownerUserId)
      const resumeRow = resume ? await store.loadLatestSession(owner) : undefined
      const nasi = await openNasiFor({
        userId: ownerUserId,
        owner,
        pinnedModel: await pinnedModelFor(ownerUserId, resumeRow?.id),
        language: language.locale,
        channelInstruction: TELEGRAM_CHANNEL_INSTRUCTION
      })
      try {
        let ended = false
        const photos = new Map<string, number>()
        const turn = nasi.turn({ session: resumeRow?.id, ...input, onSession: id => (sessionId = id) })
        for await (const event of turn) {
          // Read to the end even after the reply is out: the turn is only saved once the generator finishes (and a
          // tool image's description, written by then, still reaches its photo's caption).
          if (ended && event.type !== "image_described") continue
          if (event.type === "delta") {
            if (event.channel === "content") reply.append(event.text)
            continue
          }
          if (event.type === "usage") continue
          ended = (await handleFinalizedEvent(reply, chatId, event, language, photos)) || ended
        }
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
      const { category, message } = categorizeError(error)
      // The category in the user's language, like the terminal shows it; the detail is the provider's own (technical) text.
      const label = language.t(`telegram.error.${category}`)
      await reply.fail(`⚠ ${label}: ${message}`)
    }
  }

  /**
   * `telegramLanguage` is the sender's Telegram app language, used only when their account has none saved. `images`
   * (data URLs): a photo sent with the message, whose caption is `text`; it always runs as a turn, never a command.
   */
  async function handleMessage(
    telegramUserId: number,
    chatId: number,
    text: string,
    telegramLanguage?: string,
    images: string[] = []
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

    if (images.length > 0) return startTurn(telegramUserId, ownerUserId, owner, chatId, text, language, images)

    if (isCommand(text, "new")) {
      forceNew.add(telegramUserId)
      await sender.sendMessage(chatId, t("telegram.newSession"))
      return
    }

    const focus = commandArgument(text, "compact")
    if (focus !== undefined) {
      // After /new there's no conversation to compact yet, and the next message still starts a fresh one.
      await compactNow(ownerUserId, owner, chatId, focus, !forceNew.has(telegramUserId), t)
      return
    }

    await startTurn(telegramUserId, ownerUserId, owner, chatId, text, language)
  }

  async function startTurn(
    telegramUserId: number,
    ownerUserId: string,
    owner: string,
    chatId: number,
    text: string,
    language: BotLanguage,
    images?: string[]
  ) {
    const resume = !forceNew.delete(telegramUserId)
    try {
      await runTurn(ownerUserId, owner, chatId, text, resume, language, images)
    } catch (error) {
      reportError("Telegram turn crashed", error)
    }
  }

  /**
   * A button press: Approve/Decline on a tool call. The pressing user comes
   * from Telegram (never the payload). An approval must match the call their latest session is still waiting
   * on, so an old or foreign button does nothing; the server then runs (or skips) the call it saved.
   * Returns false for callback data that isn't ours.
   */
  async function handleCallback(
    telegramUserId: number,
    chatId: number,
    messageId: number,
    data: string,
    telegramLanguage?: string
  ) {
    const match = TOOL_CALLBACK.exec(data)
    if (!match) return false
    const linked = await resolveLinkedUser(telegramUserId)
    const language = botLanguage(linked?.locale, telegramLanguage)
    const { t } = language
    if (!linked) {
      await sender.sendMessage(chatId, t("telegram.notLinked"))
      return true
    }
    const ownerUserId = linked.userId

    const owner = telegramOwner(telegramUserId)
    const approval = match[1] as "approve" | "approve_session" | "decline"

    try {
      await withLock(`telegram:${owner}`, async () => {
        const row = await createPostgresStore(pool, ownerUserId).loadLatestSession(owner)
        const session = row?.session
        const pendingId = session?.pendingToolApprovalId
        const call = session && pendingId ? pendingToolCall(session, pendingId) : undefined
        if (!call || approvalToken(pendingId!) !== match[2]) {
          await editSafely(chatId, messageId, t("telegram.approvalExpired"))
          return
        }
        const status = approval === "decline" ? t("telegram.declined") : t("telegram.approved")
        await editSafely(chatId, messageId, `🔐 <b>${escapeHtml(call.function.name)}</b>: ${status}`)
        await runTurnLocked(ownerUserId, owner, chatId, { approval }, true, language)
      })
    } catch (error) {
      reportError("Telegram approval crashed", error)
    }
    return true
  }

  return { handleMessage, handleCallback }
}
