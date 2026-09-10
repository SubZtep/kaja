import { expect, test } from "bun:test"
import { fetchPublicHttp, ProxyUnavailableError, UnsafeUrlError } from "../../src/security/ssrf"

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

// The origin here is reachable and would answer a direct request, so a pass proves the fetch failed closed rather than quietly bypassing the dead proxy.
test("a dead proxy fails closed instead of falling back to direct egress", async () => {
  let reached = false
  const origin = Bun.serve({
    port: 0,
    fetch: () => {
      reached = true
      return new Response("secret")
    }
  })
  // Port 9 is the RFC 863 discard port — nothing accepts connections there.
  const deadProxy = "http://127.0.0.1:9"
  try {
    await expect(
      fetchPublicHttp(`http://example.com:${origin.port}/`, { proxy: deadProxy, timeoutMs: 2_000 })
    ).rejects.toBeInstanceOf(ProxyUnavailableError)
    expect(reached).toBe(false)
  } finally {
    await origin.stop(true)
  }
})
