/** An image as a data URL, the way a model request carries it. */
export const imageDataUrl = (image: { data: Uint8Array; mimeType: string }) =>
  `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`

const DATA_URL = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s

/** A base64 data URL's bytes; undefined for anything else (an http URL). */
export function dataUrlBytes(url: string): Uint8Array | undefined {
  const match = DATA_URL.exec(url)
  return match ? Buffer.from(match[2]!, "base64") : undefined
}

/** What a model is told in place of images it couldn't be shown, e.g. "(1 image not shown: not an image)". */
export function imageNote(reasons: string[]): string {
  if (reasons.length === 0) return ""
  const count = reasons.length === 1 ? "1 image" : `${reasons.length} images`
  return `(${count} not shown: ${[...new Set(reasons)].join("; ")})`
}

/** `text` with {@link imageNote} after it, when any image was refused. */
export function withImageNote(text: string, reasons: string[]): string {
  const note = imageNote(reasons)
  if (!note) return text
  return text ? `${text}\n\n${note}` : note
}
