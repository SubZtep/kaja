import { EditThrottle } from "./bot"
import { renderTelegramHtml, splitTelegramMessage, telegramImages, truncateForStreaming } from "./markdown"

/** What a streamed Telegram reply needs from its bot: plain sends and edits, photos, and the host's own rules. */
export type ReplyChannel<Photo> = {
  send(text: string): Promise<{ messageId: number }>
  edit(messageId: number, text: string): Promise<void>
  sendPhoto(photo: Photo, caption?: string): Promise<void>
  /** Where a reply's `![alt](src)` image comes from, or undefined to leave it out: each host decides what a reply may send. */
  photoSource(src: string): Photo | undefined
  /** What a reply with no text and no image says, in the user's language. */
  emptyReply: string
  /** Where a failed edit or photo is logged; neither ends the turn. */
  warn(message: string, error: unknown): void
}

/** A reply in the making: a "…" placeholder the streamed text edits in place, then the finished message. */
export type Reply = {
  /** The text streamed so far. */
  readonly streamed: string
  /** Adds a content delta; the placeholder catches up at the throttle's pace. */
  append(text: string): void
  /** Writes the finished reply: its HTML (split over more messages past Telegram's limit), then its images as photos. */
  finish(rawText: string): Promise<void>
  /** Before a prompt that pauses the turn (an approval): what was streamed becomes the finished text, or, with nothing streamed, the placeholder stays as it is. */
  settle(): Promise<void>
  /** Replaces the placeholder with `text` as it is (an error line), ending the stream. */
  fail(text: string): Promise<void>
}

/** Sends the placeholder and returns the {@link Reply} that fills it. Every edit goes through one dedupe, so the throttle and a final edit never send the same text twice. */
export async function openReply<Photo>(channel: ReplyChannel<Photo>): Promise<Reply> {
  const placeholder = await channel.send("…")
  let streamed = ""
  let lastSent: string | undefined

  async function editIfChanged(text: string) {
    if (text === lastSent) return
    lastSent = text
    try {
      await channel.edit(placeholder.messageId, text)
    } catch (error) {
      channel.warn("Telegram edit failed", error)
    }
  }

  const throttle = new EditThrottle(editIfChanged, error => channel.warn("Telegram edit failed", error))
  const renderStreamed = () => (streamed.trim() ? truncateForStreaming(renderTelegramHtml(streamed)) : "…")

  async function finish(rawText: string) {
    throttle.cancel()
    const photos = telegramImages(rawText).flatMap(image => {
      const photo = channel.photoSource(image.src)
      return photo ? [{ photo, alt: image.alt }] : []
    })
    // A reply that is only an image (no alt) leaves no text: the placeholder then just marks the photo below
    const html = renderTelegramHtml(rawText) || (photos.length > 0 ? "📷" : channel.emptyReply)
    const [first, ...rest] = splitTelegramMessage(html)
    await editIfChanged(first!)
    for (const chunk of rest) await channel.send(chunk)
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
    async settle() {
      throttle.cancel()
      if (streamed.trim()) await finish(streamed)
    },
    async fail(text) {
      throttle.cancel()
      await editIfChanged(text)
    }
  }
}

/** The chat line for a compaction; `t` translates the host's `telegram.compacted` and `telegram.compactedDropped`. */
export function compactedLine(
  result: { beforeTokens: number; afterTokens: number; dropped: boolean },
  t: (key: string, params: Record<string, string>) => string
): string {
  return t(result.dropped ? "telegram.compactedDropped" : "telegram.compacted", {
    before: result.beforeTokens.toLocaleString(),
    after: result.afterTokens.toLocaleString()
  })
}
