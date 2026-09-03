const locks = new Map<string, Promise<void>>()

/** Serializes calls sharing the same key via an in-process promise chain — not distributed, fine for a single API instance. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const next = new Promise<void>(resolve => {
    release = resolve
  })
  locks.set(
    key,
    prev.then(() => next)
  )
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(key) === next) locks.delete(key)
  }
}
