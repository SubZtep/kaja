import terminalImage from "terminal-image"
import { log } from "../logger"

/**
 * Resolves `src` (an http(s) URL or a local file path) to image bytes and
 * renders it as ANSI half-block text via terminal-image.
 * Returns null on any failure (unreachable URL, unreadable file, unsupported
 * format) so callers can fall back to plain text instead of crashing.
 */
export async function renderTerminalImage(src: string, options?: { width?: string | number }): Promise<string | null> {
  try {
    const buffer =
      src.startsWith("http://") || src.startsWith("https://")
        ? await fetch(src).then(res => {
            if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`)
            return res.arrayBuffer()
          })
        : await Bun.file(src).arrayBuffer()
    return await terminalImage.buffer(new Uint8Array(buffer), {
      width: options?.width ?? "60%",
      height: "80%",
      preserveAspectRatio: true,
      // Always half-blocks: Kitty's protocol draws straight to stdout behind Ink's back, and Ink drops iTerm2's
      preferNativeRender: false
    })
  } catch (error) {
    log.warn("Failed to render terminal image", { error, src })
    return null
  }
}
