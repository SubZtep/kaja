import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test"

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

// mock.module replaces node:dns in the shared module registry for the rest of the bun test
// process (not just this file), so later files that import it for real DNS work (e.g. nodemailer)
// would otherwise get this stub instead — restore it once this file's tests are done.
afterAll(() => {
  mock.restore()
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

test("a checked hop connects to the address it checked, naming the host only in Host and SNI", async () => {
  // Public for the check, private for anyone who asks again: the rebinding a second lookup would fall for
  lookup.mockImplementationOnce(async () => [{ address: "203.0.113.9", family: 4 }])
  const sent: { url: string; init: BunFetchRequestInit }[] = []
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: BunFetchRequestInit) => {
    sent.push({ url, init })
    return new Response("ok")
  }) as unknown as typeof fetch)
  try {
    const res = await fetchPublicHttp("https://rebind.example.com:8443/page?q=1")
    expect(await res.text()).toBe("ok")
  } finally {
    fetchSpy.mockRestore()
  }
  expect(lookup).toHaveBeenCalledTimes(1)
  expect(sent[0]!.url).toBe("https://203.0.113.9:8443/page?q=1")
  expect(new Headers(sent[0]!.init.headers).get("host")).toBe("rebind.example.com:8443")
  expect(sent[0]!.init.tls?.serverName).toBe("rebind.example.com")
})
