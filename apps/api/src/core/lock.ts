const locks = new Map<string, Promise<void>>()

function acquire(key: string): { wait: Promise<void>; release: () => void } {
  const prev = locks.get(key) ?? Promise.resolve()
  let release: () => void = () => {}
  const next = new Promise<void>(resolve => {
    release = resolve
  })
  locks.set(
    key,
    prev.then(() => next)
  )
  return {
    wait: prev,
    release: () => {
      release()
      if (locks.get(key) === next) locks.delete(key)
    }
  }
}

/** Serializes calls sharing the same key via an in-process promise chain — not distributed, fine for a single API instance. */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const { wait, release } = acquire(key)
  await wait
  try {
    return await fn()
  } finally {
    release()
  }
}

/** Generator variant of {@link withLock}: holds the lock until the wrapped generator is fully drained (returned, thrown, or abandoned via `.return()`), not just until it's created. */
export async function* withLockGenerator<T, TReturn, TNext>(
  key: string,
  fn: () => AsyncGenerator<T, TReturn, TNext>
): AsyncGenerator<T, TReturn, TNext> {
  const { wait, release } = acquire(key)
  await wait
  try {
    const gen = fn()
    let next = await gen.next()
    while (!next.done) {
      next = await gen.next(yield next.value)
    }
    return next.value
  } finally {
    release()
  }
}
