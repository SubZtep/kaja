import { trackProcess } from "./processes"

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_BYTES = 64 * 1024

export type RunShellCommandOptions = {
  /** Kills the child after this long. Default 15 s. */
  timeoutMs?: number
  /** Bytes kept from each of stdout and stderr. Default 64 KiB. */
  maxBytes?: number
}

/**
 * Runs a shell command and returns a plain-text summary (exit code plus any stdout/stderr).
 * Safe commands run this with no prompt; anything else only after the human approves.
 * Each stream is capped and the child is killed on timeout or when a stream passes the cap,
 * so a safe `cat` of an endless file cannot fill memory.
 */
export async function runShellCommand(command: string, opts: RunShellCommandOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  // Detached: the shell leads its own process group, so a kill reaches what it started too (dash forks a command rather than exec it, and that child would keep the pipes open)
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
    detached: true
  })
  const stop = () => {
    try {
      process.kill(-proc.pid, "SIGTERM")
    } catch {
      proc.kill()
    }
  }
  trackProcess(proc, stop)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    stop()
  }, timeoutMs)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readCapped(proc.stdout, maxBytes, stop),
      readCapped(proc.stderr, maxBytes, stop),
      proc.exited
    ])
    const parts = [`Exit code: ${exitCode}`]
    if (stdout.text.trim()) parts.push(`stdout:\n${stdout.text.trim()}`)
    if (stderr.text.trim()) parts.push(`stderr:\n${stderr.text.trim()}`)
    if (timedOut) parts.push(`Timed out after ${timeoutMs} ms`)
    if (stdout.truncated || stderr.truncated) parts.push(`Output cut at ${maxBytes} bytes`)
    return parts.join("\n\n")
  } finally {
    clearTimeout(timer)
  }
}

/** Reads at most `maxBytes`, then cancels the stream and calls `onCap` so the child is killed. */
async function readCapped(
  stream: ReadableStream<Uint8Array> | null | undefined,
  maxBytes: number,
  onCap: () => void
): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const room = maxBytes - total
      if (value.byteLength > room) {
        if (room > 0) chunks.push(value.subarray(0, room))
        truncated = true
        onCap()
        await reader.cancel()
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } catch {
    // The child was killed (timeout, or the other stream hit the cap) and the pipe closed.
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const buf = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    buf.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(buf), truncated }
}
