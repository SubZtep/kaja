import { log } from "../logger"

// How long a launcher gets to fail (xdg-open exits nonzero when nothing can open the file) before it counts as opened.
const LAUNCH_WAIT_MS = 1500

/**
 * Opens an image (a file path or URL) in the system's viewer through the `open` package; false when nothing could, so
 * the caller can offer the plain link instead.
 */
export async function openImage(target: string): Promise<boolean> {
  try {
    const { default: open } = await import("open")
    const child = await open(target)
    return await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(true), LAUNCH_WAIT_MS)
      const done = (opened: boolean) => {
        clearTimeout(timer)
        resolve(opened)
      }
      child.once("error", () => done(false))
      child.once("close", code => done(code === 0 || code === null))
    })
  } catch (error) {
    log.warn("Couldn't open an image", { error })
    return false
  }
}
