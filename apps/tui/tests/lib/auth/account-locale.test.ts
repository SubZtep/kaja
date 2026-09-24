import { afterEach, expect, test } from "bun:test"

const { clearToken, saveToken } = await import("../../../lib/auth/credentials")
const { saveAccountLocale } = await import("../../../lib/auth/account-locale")

const realFetch = globalThis.fetch
const calls: { url: string; init?: RequestInit }[] = []

function stubFetch(status: number) {
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    return new Response(null, { status })
  }) as typeof fetch
}

afterEach(async () => {
  globalThis.fetch = realFetch
  calls.length = 0
  await clearToken()
})

test("saves the language on the signed-in account", async () => {
  await saveToken("tok_abc")
  stubFetch(200)

  await saveAccountLocale("hu-HU")

  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toEndWith("/auth/update-user")
  expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer tok_abc")
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ locale: "hu-HU" })
})

test("signed out, it makes no request", async () => {
  stubFetch(200)
  await saveAccountLocale("hu-HU")
  expect(calls).toHaveLength(0)
})

test("a failed save doesn't throw", async () => {
  await saveToken("tok_abc")
  stubFetch(401)
  expect(saveAccountLocale("zh-TW")).resolves.toBeUndefined()
})
