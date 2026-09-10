import { error as logError, warn as logWarn } from "@kaja/logger"
import { categorizeError, type FinalizedAgentEvent } from "@kaja/nasi"
import { telegramOwner } from "@kaja/schema/store"
import { renderTelegramHtml, splitTelegramMessage, truncateForStreaming } from "@kaja/shared"
import { pool } from "../../core/db"
import { withLock } from "../../core/lock"
import { openNasiFor, pinnedModelFor } from "../nasi/chat"
import { createPostgresStore } from "../nasi/pg-store"

const NOT_LINKED_MESSAGE =
  "This Telegram account isn't linked to a Kaja account yet. Go to your profile on the Kaja web app and tap " +
  '"Connect Telegram" to get a link.'

const MIN_EDIT_INTERVAL_MS = 1000
const MAX_EDIT_INTERVAL_MS = 4000

/** Thrown by a TelegramSender implementation on a 429 response, so EditThrottle can back off. */
export class TelegramRateLimitError extends Error {
  retryAfterSec: number | undefined

  constructor(retryAfterSec: number | undefined) {
    super("Telegram rate limit")
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * Abstraction over the actual Telegram API calls, so the driver has zero
 * import of grammy itself. bot.ts implements this against the real bot.api,
 * translating grammy's own errors (429s, "message is not modified") at that
 * boundary. No inline-keyboard support: unlike the local bot, cloud Nasi
 * never emits confirm_command, so nothing here ever needs one.
 */
export type TelegramSender = {
  sendMessage(chatId: number, text: string): Promise<{ messageId: number }>
  editMessageText(chatId: number, messageId: number, text: string): Promise<void>
}

export type CloudTelegramDriverConfig = {
  /** Resolves a Telegram user id to the Kaja account it's linked to, or undefined if unlinked. */
  resolveLinkedUserId: (telegramUserId: number) => Promise<string | undefined>
  sender: TelegramSender
}

/**
 * Coalesces rapid delta events into at most one Telegram edit per
 * `intervalMs`, using only the latest accumulated text. Copied from
 * apps/tui/lib/telegram/driver.ts's EditThrottle (pure, no grammy coupling).
 */
class EditThrottle {
  private intervalMs = MIN_EDIT_INTERVAL_MS
  private lastEditAt = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private pendingRender: (() => string) | undefined
  private readonly sendEdit: (text: string) => Promise<void>

  constructor(sendEdit: (text: string) => Promise<void>) {
    this.sendEdit = sendEdit
  }

  request(renderText: () => string) {
    this.pendingRender = renderText
    if (this.timer) return
    const elapsed = Date.now() - this.lastEditAt
    const delay = Math.max(0, this.intervalMs - elapsed)
    this.timer = setTimeout(() => void this.fire(), delay)
  }

  private async fire() {
    this.timer = undefined
    const render = this.pendingRender
    this.pendingRender = undefined
    if (!render) return
    this.lastEditAt = Date.now()
    try {
      await this.sendEdit(render())
    } catch (error) {
      if (error instanceof TelegramRateLimitError) {
        this.intervalMs = Math.min(this.intervalMs * 2, MAX_EDIT_INTERVAL_MS)
        if (error.retryAfterSec) this.lastEditAt = Date.now() + error.retryAfterSec * 1000
      } else {
        logWarn("Telegram edit failed", { error })
      }
    }
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.pendingRender = undefined
  }
}

/**
 * Cloud counterpart to apps/tui/lib/telegram/driver.ts. Each Telegram user
 * must link their own Kaja account first (see bot.ts's /start handler); the
 * owning `userId` is resolved fresh per message via `resolveLinkedUserId`,
 * never fixed. `telegramOwner(userId)` is still used as the `owner` within
 * that account's Postgres partition, so a linked user's bot conversations
 * stay separate from their web/lite ones (same mechanism widget visitors
 * use — see runWidgetTurn). No per-user Agent cache: `openNasiFor` is
 * called fresh per turn, same as every HTTP /nasi/turn call — state
 * round-trips through Postgres via the session id instead of living in
 * memory.
 */
export function createCloudTelegramDriver(config: CloudTelegramDriverConfig) {
  const { resolveLinkedUserId, sender } = config
  // Marks a Telegram user's next message as "don't resume" after /new. No other in-memory
  // state exists — session content itself always round-trips through Postgres.
  const forceNew = new Set<number>()

  async function editSafely(chatId: number, messageId: number, text: string) {
    try {
      await sender.editMessageText(chatId, messageId, text)
    } catch (error) {
      logWarn("Telegram edit failed", { error })
    }
  }

  async function finalizeMessage(edit: (text: string) => Promise<void>, chatId: number, rawText: string) {
    const html = renderTelegramHtml(rawText) || "(empty response)"
    const [first, ...rest] = splitTelegramMessage(html)
    await edit(first!)
    for (const chunk of rest) await sender.sendMessage(chatId, chunk)
  }

  /** Returns true once the event has ended the turn (ask_user, final) so runTurn knows to stop iterating. Local-only events (tool_image, display_image, confirm_command) are ignored — cloud Nasi never emits them. */
  function handleFinalizedEvent(
    accumulated: { content: string },
    throttle: EditThrottle,
    editIfChanged: (text: string) => Promise<void>,
    chatId: number,
    event: FinalizedAgentEvent
  ): Promise<boolean> | boolean {
    if (event.type === "ask_user") {
      throttle.cancel()
      const text = accumulated.content.trim() ? `${accumulated.content}\n\n${event.question}` : event.question
      return finalizeMessage(editIfChanged, chatId, text).then(() => true)
    }

    if (event.type === "final") {
      throttle.cancel()
      return finalizeMessage(editIfChanged, chatId, event.content ?? "").then(() => true)
    }

    return false
  }

  // Serializes turns per Telegram user, mirroring nasi/chat.ts's withSessionLock — without it,
  // two rapid messages from the same user could both resolve the same "latest session" and race
  // its persistence.
  function runTurn(ownerUserId: string, owner: string, chatId: number, prompt: string, resume: boolean) {
    return withLock(`telegram:${owner}`, () => runTurnLocked(ownerUserId, owner, chatId, prompt, resume))
  }

  async function runTurnLocked(ownerUserId: string, owner: string, chatId: number, prompt: string, resume: boolean) {
    const placeholder = await sender.sendMessage(chatId, "…")
    const accumulated = { content: "" }
    const renderCurrent = () =>
      accumulated.content.trim() ? truncateForStreaming(renderTelegramHtml(accumulated.content)) : "…"
    let lastSentText: string | undefined
    async function editIfChanged(text: string) {
      if (text === lastSentText) return
      lastSentText = text
      await editSafely(chatId, placeholder.messageId, text)
    }
    const throttle = new EditThrottle(editIfChanged)

    try {
      const store = createPostgresStore(pool, ownerUserId)
      const resumeRow = resume ? await store.loadLatestSession(owner) : undefined
      const nasi = await openNasiFor({
        userId: ownerUserId,
        owner,
        pinnedModel: await pinnedModelFor(ownerUserId, resumeRow?.id)
      })
      for await (const event of nasi.turn({ session: resumeRow?.id, message: prompt })) {
        if (event.type === "delta") {
          if (event.channel === "content") {
            accumulated.content += event.text
            throttle.request(renderCurrent)
          }
          continue
        }
        if (event.type === "usage") continue
        const done = await handleFinalizedEvent(accumulated, throttle, editIfChanged, chatId, event)
        if (done) return
      }
    } catch (error) {
      logWarn("Telegram agent turn failed", { error })
      const { category, message } = categorizeError(error)
      await editIfChanged(`⚠ ${category}: ${message}`)
    }
  }

  async function handleMessage(telegramUserId: number, chatId: number, text: string) {
    const ownerUserId = await resolveLinkedUserId(telegramUserId)
    if (!ownerUserId) {
      await sender.sendMessage(chatId, NOT_LINKED_MESSAGE)
      return
    }

    const owner = telegramOwner(telegramUserId)

    if (text.trim() === "/new") {
      forceNew.add(telegramUserId)
      await sender.sendMessage(chatId, "🆕 Started a new session.")
      return
    }

    const resume = !forceNew.delete(telegramUserId)
    try {
      await runTurn(ownerUserId, owner, chatId, text, resume)
    } catch (error) {
      logError("Telegram turn crashed", { error })
    }
  }

  return { handleMessage }
}
