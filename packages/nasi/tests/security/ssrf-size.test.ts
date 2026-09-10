import { expect, test } from "bun:test"
import { fetchPublicHttp } from "../../src/security/ssrf"

// isPublicHttpUrl only inspects the literal hostname (no DNS), so a public-looking
// address plus a proxy pointed at a local Bun.serve is the only way to exercise a
// real response body without egressing to the internet.
const PUBLIC_URL = "http://172.32.0.1/"

function serveBody(body: BodyInit) {
  return Bun.serve({ port: 0, fetch: () => new Response(body) })
}

test("a response over maxBytes is rejected", async () => {
  const origin = serveBody("x".repeat(4096))
  try {
    await expect(
      fetchPublicHttp(PUBLIC_URL, { proxy: `http://127.0.0.1:${origin.port}`, maxBytes: 1024, timeoutMs: 3_000 })
    ).rejects.toThrow(/Response too large/)
  } finally {
    await origin.stop(true)
  }
})

test("a response under maxBytes is returned intact", async () => {
  const body = "y".repeat(4096)
  const origin = serveBody(body)
  try {
    const res = await fetchPublicHttp(PUBLIC_URL, {
      proxy: `http://127.0.0.1:${origin.port}`,
      maxBytes: 8192,
      timeoutMs: 3_000
    })
    expect(await res.text()).toBe(body)
  } finally {
    await origin.stop(true)
  }
})

// The cap must stop reading mid-stream rather than buffering the whole body and
// checking afterwards, so an endless response can't exhaust memory.
test("an oversized stream is aborted instead of buffered whole", async () => {
  let sent = 0
  const chunk = new Uint8Array(64 * 1024)
  const origin = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            sent += chunk.byteLength
            controller.enqueue(chunk)
          }
        })
      )
  })
  try {
    await expect(
      fetchPublicHttp(PUBLIC_URL, {
        proxy: `http://127.0.0.1:${origin.port}`,
        maxBytes: 128 * 1024,
        timeoutMs: 3_000
      })
    ).rejects.toThrow(/Response too large/)
    // Bounded by the cap plus a little read-ahead — not the unbounded stream.
    expect(sent).toBeLessThan(8 * 1024 * 1024)
  } finally {
    await origin.stop(true)
  }
})
