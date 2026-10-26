import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { forwardSentryEnvelope, SENTRY_DSN } from "../../src/lib/sentry-tunnel"

const post = (body: string) => new Request("http://localhost/t", { method: "POST", body })
const envelope = (dsn: string) => `${JSON.stringify({ dsn })}\n{"type":"event"}\n{}`

describe("forwardSentryEnvelope", () => {
  afterEach(() => mock.restore())

  test("forwards our own DSN's envelope to its ingest endpoint", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }))
    const res = await forwardSentryEnvelope(post(envelope(SENTRY_DSN)))
    expect(res.status).toBe(200)
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://o326475.ingest.us.sentry.io/api/4512040899444736/envelope/")
  })

  test("refuses another DSN", async () => {
    const fetchSpy = spyOn(globalThis, "fetch")
    const res = await forwardSentryEnvelope(post(envelope("https://key@evil.example/4512040899444736")))
    expect(res.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test("refuses a malformed envelope", async () => {
    const res = await forwardSentryEnvelope(post("not json"))
    expect(res.status).toBe(400)
  })
})
