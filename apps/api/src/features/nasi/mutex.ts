const locks = new Map<string, Promise<void>>()

export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve()
  let release: () => void = () => {}
  const next = new Promise<void>(resolve => {
    release = resolve
  })
  locks.set(
    userId,
    prev.then(() => next)
  )
  await prev
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(userId) === next) locks.delete(userId)
  }
}
