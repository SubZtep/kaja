import terminalImage from "terminal-image"
import { t } from "../i18n"
import { log } from "../logger"

/** A rendered image, or why it couldn't be shown (for the line under it). */
export type TerminalImageResult = { image: string } | { error: string }

class HttpError extends Error {}

const REMOTE_CACHE_SIZE = 16
// Remote bytes by source, so re-rendering at another size (resize) doesn't download again. Local files are re-read, they may be overwritten.
const remoteCache = new Map<string, Promise<ArrayBuffer>>()

function fetchRemote(src: string): Promise<ArrayBuffer> {
  const cached = remoteCache.get(src)
  if (cached) return cached
  const pending = fetch(src).then(res => {
    if (!res.ok) throw new HttpError(`HTTP ${res.status}`)
    return res.arrayBuffer()
  })
  remoteCache.set(src, pending)
  pending.catch(() => remoteCache.delete(src))
  if (remoteCache.size > REMOTE_CACHE_SIZE) remoteCache.delete(remoteCache.keys().next().value!)
  return pending
}

/**
 * Resolves `src` (an http(s) or data URL, or a local file path) to image bytes and
 * renders it as ANSI half-block text via terminal-image.
 * `height` (rows, or a percentage of the terminal) defaults to 80% of the terminal.
 * Never throws: on any failure (unreachable URL, missing file, unsupported
 * format) it returns a short reason, so callers can fall back to plain text.
 */
export async function renderTerminalImage(
  src: string,
  options?: { width?: string | number; height?: string | number }
): Promise<TerminalImageResult> {
  const remote = src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")
  let buffer: ArrayBuffer
  try {
    buffer = remote ? await fetchRemote(src) : await Bun.file(src).arrayBuffer()
  } catch (error) {
    log.warn("Failed to load terminal image", { error, src: src.slice(0, 200) })
    if (error instanceof HttpError) return { error: error.message }
    return { error: t(remote ? "timeline.imageUnreachable" : "timeline.imageMissing") }
  }
  try {
    const image = await terminalImage.buffer(new Uint8Array(buffer), {
      width: options?.width ?? "60%",
      height: options?.height ?? "80%",
      preserveAspectRatio: true,
      // Always half-blocks: Kitty's protocol draws straight to stdout behind Ink's back, and Ink drops iTerm2's
      preferNativeRender: false
    })
    return { image }
  } catch (error) {
    log.warn("Failed to render terminal image", { error, src: src.slice(0, 200) })
    return { error: t("timeline.imageUnreadable") }
  }
}
