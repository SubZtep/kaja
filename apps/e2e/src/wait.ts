/** Reads until `done` accepts the value or the time is up; returns the last value read either way, so the caller can say what it saw. */
export async function pollUntil<T>(
  read: () => Promise<T> | T,
  done: (value: T) => boolean,
  { timeoutMs, intervalMs = 500 }: { timeoutMs: number; intervalMs?: number }
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!done(value) && Date.now() < deadline) {
    await Bun.sleep(intervalMs)
    value = await read()
  }
  return value
}
