import { expect, test } from "bun:test"
import { type FetchLike, fetchPublicHttp, UnsafeUrlError } from "../../src/security/ssrf"

test("rejects loopback and private URLs", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://192.168.1.1/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd"
  ]) {
    await expect(fetchPublicHttp(url)).rejects.toBeInstanceOf(UnsafeUrlError)
  }
})

// The origin here is reachable and would answer a direct request, so a pass proves the fetch failed rather than quietly going direct.
test("a failing sender fails instead of falling back to direct egress", async () => {
  let reached = false
  const origin = Bun.serve({
    port: 0,
    fetch: () => {
      reached = true
      return new Response("secret")
    }
  })
  const failing: FetchLike = () => Promise.reject(new Error("no sandbox is online"))
  try {
    await expect(
      fetchPublicHttp(`http://example.com:${origin.port}/`, { send: failing, timeoutMs: 2_000 })
    ).rejects.toThrow("no sandbox is online")
    expect(reached).toBe(false)
  } finally {
    await origin.stop(true)
  }
})
