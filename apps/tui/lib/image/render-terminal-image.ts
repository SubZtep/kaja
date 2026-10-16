import terminalImage from "terminal-image"
import { t } from "../i18n"
import { log } from "../logger"

/** A rendered image, or why it couldn't be shown (for the line under it). */
export type TerminalImageResult = { image: string } | { error: string }

class HttpError extends Error {}

const REMOTE_CACHE_SIZE = 16
const RENDERED_CACHE_SIZE = 16
// Remote bytes by source, so re-rendering at another size (resize) doesn't download again. Local files are re-read, they may be overwritten.
const remoteCache = new Map<string, Promise<ArrayBuffer>>()

/**
 * Pictures already drawn, by source and size: the promise (so rows showing the same one at once share the work) and
 * what it resolved to. An image row is unmounted every time it scrolls out of the chat's window and mounted again
 * when it scrolls back, and a picture kept only in the row's own state would come back blank: the row would measure
 * its alt text's height again, the chat would scroll, and the row would leave the window once more — the picture
 * never settling. Cached, a remounted row paints the same picture at the same height at once.
 */
const rendered = new Map<string, Promise<TerminalImageResult>>()
const drawn = new Map<string, TerminalImageResult>()

function remote(src: string) {
  return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")
}

// A local file may be overwritten under its path (a tool rewriting it), so its render is keyed by what the file was
// when read as well; a URL's bytes are what they are. A data URL is keyed by its hash, not the megabytes of base64.
function renderKey(src: string, options?: { width?: string | number; height?: string | number }) {
  let source = src
  if (!remote(src)) {
    const file = Bun.file(src)
    source = `${file.size}:${file.lastModified}:${src}`
  } else if (src.startsWith("data:")) source = `data:${Bun.hash(src)}`
  return `${source}\0${options?.width}\0${options?.height}`
}

/** What is already drawn for `src` at this size, if it is known: a row's first paint, before any render of its own. */
export function drawnTerminalImage(
  src: string,
  options?: { width?: string | number; height?: string | number }
): TerminalImageResult | undefined {
  return drawn.get(renderKey(src, options))
}

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
 * Draws `src` (an http(s) or data URL, or a local file path) as ANSI half-block text via terminal-image, at
 * `width`/`height` (a percentage of the terminal by default, the picture keeping its aspect ratio). Shares the work
 * and the result with every other row drawing the same picture at the same size (see {@link drawnTerminalImage}).
 */
export function renderTerminalImage(
  src: string,
  options?: { width?: string | number; height?: string | number }
): Promise<TerminalImageResult> {
  const key = renderKey(src, options)
  const cached = rendered.get(key)
  if (cached) return cached
  const pending = drawTerminalImage(src, options).then(result => {
    // A failure isn't kept, so a URL that was briefly out of reach (or a file not written yet) is drawn again when a
    // row asks for it next. An entry dropped meanwhile (the cache moved on) doesn't get one either.
    if ("error" in result) rendered.delete(key)
    else if (rendered.has(key)) drawn.set(key, result)
    return result
  })
  rendered.set(key, pending)
  if (rendered.size > RENDERED_CACHE_SIZE) {
    const oldest = rendered.keys().next().value!
    rendered.delete(oldest)
    drawn.delete(oldest)
  }
  return pending
}

async function drawTerminalImage(
  src: string,
  options?: { width?: string | number; height?: string | number }
): Promise<TerminalImageResult> {
  let buffer: ArrayBuffer
  try {
    buffer = remote(src) ? await fetchRemote(src) : await Bun.file(src).arrayBuffer()
  } catch (error) {
    log.warn("Failed to load terminal image", { error, src: src.slice(0, 200) })
    if (error instanceof HttpError) return { error: error.message }
    return { error: t(remote(src) ? "timeline.imageUnreachable" : "timeline.imageMissing") }
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
