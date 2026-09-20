import { expect, test } from "bun:test"
import {
  asRateLimitError,
  EditThrottle,
  escapeHtml,
  isCommand,
  isNotModifiedError,
  TelegramRateLimitError,
  withRateLimitRetry
} from "../telegram-bot"

// grammy's GrammyError, by shape: what the helpers actually look at.
const botApiError = (error_code: number, description: string, parameters?: { retry_after?: number }) =>
  Object.assign(new Error(description), { error_code, description, parameters })

test("escapeHtml escapes only the three characters Telegram HTML needs", () => {
  expect(escapeHtml(`a < b && c > "d"`)).toBe(`a &lt; b &amp;&amp; c &gt; "d"`)
})

test("isCommand matches the bare command, with or without @botname, and nothing else", () => {
  expect(isCommand("/new", "new")).toBe(true)
  expect(isCommand(" /new@kaja_bot ", "new")).toBe(true)
  expect(isCommand("/newer", "new")).toBe(false)
  expect(isCommand("please /new", "new")).toBe(false)
})

test("error helpers recognise a Bot API error by its shape", () => {
  expect(isNotModifiedError(botApiError(400, "Bad Request: message is not modified"))).toBe(true)
  expect(isNotModifiedError(botApiError(400, "Bad Request: chat not found"))).toBe(false)
  expect(isNotModifiedError(new Error("message is not modified"))).toBe(false)
  expect(asRateLimitError(botApiError(429, "Too Many Requests", { retry_after: 3 }))?.retryAfterSec).toBe(3)
  expect(asRateLimitError(botApiError(500, "boom"))).toBeUndefined()
})

test("withRateLimitRetry retries once after a 429 and gives up on anything else", async () => {
  let calls = 0
  const flaky = async () => {
    calls += 1
    if (calls === 1) throw botApiError(429, "Too Many Requests", { retry_after: 0.001 })
    return "sent"
  }
  expect(await withRateLimitRetry(flaky)).toBe("sent")
  expect(calls).toBe(2)

  const broken = async () => {
    throw botApiError(500, "boom")
  }
  await expect(withRateLimitRetry(broken)).rejects.toThrow("boom")
})

test("a 429 without retry_after is not retried", async () => {
  let calls = 0
  await expect(
    withRateLimitRetry(async () => {
      calls += 1
      throw botApiError(429, "Too Many Requests")
    })
  ).rejects.toThrow("Too Many Requests")
  expect(calls).toBe(1)
})

// Short real intervals: timers only ever fire late on a busy machine, so these waits stay generous.
const FAST = { minMs: 5, maxMs: 20 }

test("EditThrottle coalesces rapid requests into one edit with the latest text", async () => {
  const sent: string[] = []
  const throttle = new EditThrottle(
    async text => void sent.push(text),
    () => {},
    FAST
  )
  throttle.request(() => "one")
  throttle.request(() => "two")
  throttle.request(() => "three")
  await Bun.sleep(100)
  expect(sent).toEqual(["three"])
})

test("EditThrottle.cancel drops a pending edit", async () => {
  const sent: string[] = []
  const throttle = new EditThrottle(
    async text => void sent.push(text),
    () => {},
    FAST
  )
  throttle.request(() => "never")
  throttle.cancel()
  await Bun.sleep(100)
  expect(sent).toEqual([])
})

test("EditThrottle keeps going after a rate limit and reports other errors to onError", async () => {
  const sent: string[] = []
  const errors: unknown[] = []
  const failures: unknown[] = [new TelegramRateLimitError(undefined), new Error("bad request")]
  const throttle = new EditThrottle(
    async text => {
      const failure = failures.shift()
      if (failure) throw failure
      sent.push(text)
    },
    error => errors.push(error),
    FAST
  )
  for (const text of ["a", "b", "c"]) {
    throttle.request(() => text)
    await Bun.sleep(150)
  }
  expect(errors).toHaveLength(1)
  expect((errors[0] as Error).message).toBe("bad request")
  expect(sent).toEqual(["c"])
})
