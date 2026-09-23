/** Telegram allows about one edit a second per message; a 429 doubles the wait, up to the cap. */
const DEFAULT_EDIT_INTERVALS = { minMs: 1000, maxMs: 4000 }

/** Plain HTML escaping for text inside <pre>: unlike renderTelegramHtml it leaves URLs as text instead of turning them into links. */
export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** A bot command, with or without the `@botname` Telegram adds in groups. */
export function isCommand(text: string, name: string): boolean {
  return new RegExp(String.raw`^/${name}(@\w+)?$`).test(text.trim())
}

/** Thrown by a bot's sender on a 429 response, so EditThrottle can back off. */
export class TelegramRateLimitError extends Error {
  retryAfterSec: number | undefined

  constructor(retryAfterSec: number | undefined) {
    super("Telegram rate limit")
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * Coalesces rapid delta events into at most one Telegram edit per
 * `intervalMs`, using only the latest accumulated text (never queuing
 * multiple edits). Tuned for Telegram's ~1 edit/sec per-message budget, with
 * 429 backoff since Telegram (unlike a local terminal) can reject bursts.
 */
export class EditThrottle {
  private intervalMs: number
  private lastEditAt = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private pendingRender: (() => string) | undefined
  // sendEdit is expected to dedupe identical text itself — the throttle only decides *when* to call it.
  private readonly sendEdit: (text: string) => Promise<void>
  // Anything but a 429 is reported here; the host decides where that goes (the TUI can't print to the console).
  private readonly onError: (error: unknown) => void

  private readonly maxIntervalMs: number

  constructor(
    sendEdit: (text: string) => Promise<void>,
    onError: (error: unknown) => void,
    intervals = DEFAULT_EDIT_INTERVALS
  ) {
    this.sendEdit = sendEdit
    this.onError = onError
    this.intervalMs = intervals.minMs
    this.maxIntervalMs = intervals.maxMs
  }

  request(renderText: () => string) {
    this.pendingRender = renderText
    if (this.timer) return
    // Always goes through setTimeout, even at 0ms delay once intervalMs has elapsed — never fires synchronously inline. That guarantees cancel() (called from the same microtask chain that follows a delta, e.g. once run() reaches its final/ask_user/confirm_command event) can always pre-empt a still-pending fire, since a macrotask timer only runs after the current microtask queue has fully drained.
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
        this.intervalMs = Math.min(this.intervalMs * 2, this.maxIntervalMs)
        if (error.retryAfterSec) this.lastEditAt = Date.now() + error.retryAfterSec * 1000
      } else {
        this.onError(error)
      }
    }
  }

  /**
   * Cancels any pending trailing-edge edit without sending it — call before
   * a caller-driven edit that's about to supersede it anyway (final,
   * ask_user, confirm_command), so the throttle doesn't fire a redundant
   * edit moments after (or race with) that one.
   */
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.pendingRender = undefined
  }
}

type BotApiError = Error & { error_code: number; description: string; parameters?: { retry_after?: number } }

// grammy's GrammyError, recognised by shape so this package doesn't depend on grammy.
function isBotApiError(error: unknown): error is BotApiError {
  return error instanceof Error && typeof (error as Partial<BotApiError>).error_code === "number"
}

/** Telegram's "message is not modified" 400 is an expected race (see EditThrottle's own dedupe guard), not an error. */
export function isNotModifiedError(error: unknown): boolean {
  return isBotApiError(error) && error.error_code === 400 && error.description.includes("message is not modified")
}

/** Translates a 429 into the typed error EditThrottle knows how to back off on. */
export function asRateLimitError(error: unknown): TelegramRateLimitError | undefined {
  if (isBotApiError(error) && error.error_code === 429) return new TelegramRateLimitError(error.parameters?.retry_after)
  return undefined
}

/**
 * Runs `send` once, and on a single 429 sleeps for its retry_after and tries
 * exactly once more — for one-shot sends (there's no throttle to defer to,
 * unlike an edit stream, which lets TelegramRateLimitError propagate to
 * EditThrottle's own backoff). A second failure, or a 429 with no
 * retry_after, propagates.
 */
export async function withRateLimitRetry<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send()
  } catch (error) {
    const rateLimit = asRateLimitError(error)
    if (!rateLimit?.retryAfterSec) throw error
    await new Promise<void>(resolve => setTimeout(resolve, rateLimit.retryAfterSec! * 1000))
    return send()
  }
}
