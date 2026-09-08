import terminalImage from "terminal-image"
import { log } from "../logger"

/**
 * Resolves `src` (an http(s) URL or a local file path) to image bytes and
 * renders it to ANSI/terminal-graphics escape codes via terminal-image.
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
      preserveAspectRatio: true
    })
  } catch (error) {
    log.warn("Failed to render terminal image", { error, src })
    return null
  }
}
