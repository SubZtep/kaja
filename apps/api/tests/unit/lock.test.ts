import { describe, expect, test } from "bun:test"
import { withLock } from "../../src/core/lock"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

describe("withLock", () => {
  test("serializes calls sharing the same key", async () => {
    const order: string[] = []
    const first = deferred<void>()

    const a = withLock("same", async () => {
      order.push("a-start")
      await first.promise
      order.push("a-end")
    })
    const b = withLock("same", async () => {
      order.push("b-start")
      order.push("b-end")
    })

    // b must not start until a releases, even though a is still pending.
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(order).toEqual(["a-start"])

    first.resolve()
    await Promise.all([a, b])
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"])
  })

  test("does not serialize calls with different keys", async () => {
    const order: string[] = []
    const first = deferred<void>()

    const a = withLock("key-a", async () => {
      order.push("a-start")
      await first.promise
      order.push("a-end")
    })
    const b = withLock("key-b", async () => {
      order.push("b-start")
      order.push("b-end")
    })

    await b
    // b completed fully while a was still awaiting its own deferred.
    expect(order).toEqual(["a-start", "b-start", "b-end"])

    first.resolve()
    await a
    expect(order).toEqual(["a-start", "b-start", "b-end", "a-end"])
  })
})
