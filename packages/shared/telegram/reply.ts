import { EditThrottle, TelegramRateLimitError } from "./bot"
import { renderTelegramHtml, splitTelegramMessage, telegramImages, truncateForStreaming } from "./markdown"

/** The longest rate-limit wait a finished reply's edit sits out before trying once more. */
const MAX_FINAL_RETRY_SEC = 30

const PLACEHOLDER = "…"

/** What a streamed Telegram reply needs from its bot: plain sends and edits, photos, and the host's own rules. */
export type ReplyChannel<Photo> = {
  send(text: string): Promise<{ messageId: number }>
  /** Throws {@link TelegramRateLimitError} on a 429, so the stream backs off. */
  edit(messageId: number, text: string): Promise<void>
  /** Deletes a sent message: the placeholder, when a turn pauses for an approval before writing anything. */
  remove(messageId: number): Promise<void>
  sendPhoto(photo: Photo, caption?: string): Promise<void>
  /**
   * Where a reply's `![alt](src)` image comes from, or undefined to leave it out: each host decides what a reply may
   * send.
   */
  photoSource(src: string): Photo | undefined
  /** What a reply with no text and no image says, in the user's language. */
  emptyReply: string
  /** Where a failed send, edit or photo is logged; none of them ends the turn. */
  warn(message: string, error: unknown): void
}

/**
 * A turn's reply in the making: a "…" placeholder the streamed text edits in place, then the finished message, with a
 * message of its own for each round that went on to call tools.
 */
export type Reply = {
  /** The text streamed into the current message so far. */
  readonly streamed: string
  /** Adds a content delta; the message catches up at the throttle's pace. */
  append(text: string): void
  /**
   * A round that goes on to call tools: its text (`content`) becomes a finished message, and the next round's text
   * starts a new one.
   */
  endRound(content: string): Promise<void>
  /** Writes the finished reply: its HTML (split over more messages past Telegram's limit), then its images as photos. */
  finish(rawText: string): Promise<void>
  /**
   * Before a prompt that pauses the turn (an approval): what was streamed becomes the finished text, and an untouched
   * placeholder is removed.
   */
  settle(): Promise<void>
  /** Shows `text` as it is (an error line) in place of the current message, ending the stream. */
  fail(text: string): Promise<void>
}

/**
 * Sends the placeholder and returns the {@link Reply} that fills it. Edits go out one at a time, in order, and only a
 * delivered one counts, so a failed edit is tried again by the next identical one.
 */
export async function openReply<Photo>(channel: ReplyChannel<Photo>): Promise<Reply> {
  // The message being written; undefined after a finished round, until the next round's text arrives
  let messageId: number | undefined = (await channel.send(PLACEHOLDER)).messageId
  let shown: string | undefined = PLACEHOLDER
  let streamed = ""
  let queue = Promise.resolve()

  function show(text: string): Promise<void> {
    const run = queue.then(async () => {
      if (text === shown) return
      if (messageId === undefined) messageId = (await channel.send(text)).messageId
      else await channel.edit(messageId, text)
      shown = text
    })
    queue = run.catch(() => {})
    return run
  }

  /**
   * {@link show} for a finished text: nothing after it would fix a failure, so it sits out one rate limit, then only
   * logs.
   */
  async function showFinal(text: string) {
    try {
      await show(text)
    } catch (error) {
      const wait = error instanceof TelegramRateLimitError ? error.retryAfterSec : undefined
      if (wait === undefined || wait > MAX_FINAL_RETRY_SEC) return channel.warn("Telegram edit failed", error)
      await Bun.sleep(wait * 1000)
      await show(text).catch(retryError => channel.warn("Telegram edit failed", retryError))
    }
  }

  const throttle = new EditThrottle(show, error => channel.warn("Telegram edit failed", error))
  const renderStreamed = () => (streamed.trim() ? truncateForStreaming(renderTelegramHtml(streamed)) : PLACEHOLDER)

  async function finish(rawText: string) {
    throttle.cancel()
    const photos = telegramImages(rawText).flatMap(image => {
      const photo = channel.photoSource(image.src)
      return photo ? [{ photo, alt: image.alt }] : []
    })
    // A reply that is only an image (no alt) leaves no text: the placeholder then just marks the photo below
    const html = renderTelegramHtml(rawText) || (photos.length > 0 ? "📷" : channel.emptyReply)
    const [first, ...rest] = splitTelegramMessage(html)
    await showFinal(first!)
    for (const chunk of rest) {
      try {
        await channel.send(chunk)
      } catch (error) {
        channel.warn("Telegram send failed", error)
      }
    }
    for (const { photo, alt } of photos) {
      try {
        await channel.sendPhoto(photo, alt || undefined)
      } catch (error) {
        channel.warn("Telegram photo send failed", error)
      }
    }
  }

  return {
    get streamed() {
      return streamed
    },
    append(text) {
      streamed += text
      throttle.request(renderStreamed)
    },
    finish,
    async endRound(content) {
      if (content.trim()) await finish(content)
      else throttle.cancel()
      await queue
      streamed = ""
      messageId = undefined
      shown = undefined
    },
    async settle() {
      throttle.cancel()
      if (streamed.trim()) return finish(streamed)
      await queue
      if (messageId === undefined || shown !== PLACEHOLDER) return
      const placeholder = messageId
      messageId = undefined
      shown = undefined
      await channel.remove(placeholder).catch(error => channel.warn("Telegram delete failed", error))
    },
    async fail(text) {
      throttle.cancel()
      await showFinal(text)
    }
  }
}

/**
 * The chat line for a compaction, its numbers in `locale`; `t` translates the host's `telegram.compacted` and
 * `telegram.compactedDropped`.
 */
export function compactedLine(
  result: { beforeTokens: number; afterTokens: number; dropped: boolean },
  t: (key: string, params: Record<string, string>) => string,
  locale?: string
): string {
  return t(result.dropped ? "telegram.compactedDropped" : "telegram.compacted", {
    before: result.beforeTokens.toLocaleString(locale),
    after: result.afterTokens.toLocaleString(locale)
  })
}
