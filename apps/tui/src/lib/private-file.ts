import { chmod, stat } from "node:fs/promises"

/**
 * Takes group and other access away from `path` (a 0644 file becomes 0600, a 0755 folder 0700): API keys and chats
 * must not be readable by the machine's other users. A missing path, or Windows (no POSIX modes), is left alone.
 */
export async function makePrivate(path: string): Promise<void> {
  if (process.platform === "win32") return
  try {
    const { mode } = await stat(path)
    if ((mode & 0o077) !== 0) await chmod(path, mode & 0o700)
  } catch {
    // Not there (yet), or not ours to change: nothing to tighten
  }
}
