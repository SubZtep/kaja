import { afterEach, expect, mock, test } from "bun:test"

// A public-looking hostname that resolves to a private/metadata address is exactly the case
// isPublicHttpUrl's literal-hostname check can't catch (DNS rebinding, attacker-controlled DNS).
// Mocking node:dns lets us simulate that resolution without needing real rebindable DNS.
const lookup = mock(async (_hostname: string, _opts: unknown) => [{ address: "169.254.169.254", family: 4 }])
mock.module("node:dns", () => ({
  default: { promises: { lookup } },
  promises: { lookup }
}))

const { fetchPublicHttp, UnsafeUrlError } = await import("../../src/security/ssrf")

afterEach(() => {
  lookup.mockClear()
})

test("rejects a hostname that resolves to a private address", async () => {
  await expect(fetchPublicHttp("http://looks-public.example.com/")).rejects.toThrow(UnsafeUrlError)
})

test("does not DNS-check when a proxy is set (proxy owns egress resolution)", async () => {
  const origin = Bun.serve({ port: 0, fetch: () => new Response("ok") })
  try {
    const res = await fetchPublicHttp("http://looks-public.example.com/", {
      proxy: `http://127.0.0.1:${origin.port}`,
      timeoutMs: 3_000
    })
    expect(await res.text()).toBe("ok")
    expect(lookup).not.toHaveBeenCalled()
  } finally {
    await origin.stop(true)
  }
})
