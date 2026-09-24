import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const { clearToken, saveToken } = await import("../../../lib/auth/credentials")
const { saveAccountLocale, syncLocaleAfterLogin } = await import("../../../lib/auth/account-locale")
const { invalidateConfigCache } = await import("../../../lib/config/config")
const { getLanguage, setLanguage } = await import("../../../lib/i18n")

const realFetch = globalThis.fetch
const calls: { url: string; init?: RequestInit }[] = []

function stubFetch(status: number, body?: object) {
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    return new Response(body ? JSON.stringify(body) : null, { status })
  }) as typeof fetch
}

/** A cloud settings.toml in a temp config dir, as `kaja --cloud` writes it before logging in. */
function cloudConfig(locale: string) {
  const dir = mkdtempSync(join(tmpdir(), "kaja-account-locale-"))
  mkdirSync(join(dir, "kaja"))
  process.env.XDG_CONFIG_HOME = dir
  writeFileSync(join(dir, "kaja", "settings.toml"), `[preferences]\nlocale = "${locale}"\n`)
  invalidateConfigCache()
  return { dir, settings: () => readFileSync(join(dir, "kaja", "settings.toml"), "utf8") }
}

afterEach(async () => {
  globalThis.fetch = realFetch
  calls.length = 0
  await clearToken()
  setLanguage("en-GB")
  delete process.env.XDG_CONFIG_HOME
  invalidateConfigCache()
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

test("after login, the account's saved language becomes the terminal's", async () => {
  const { dir, settings } = cloudConfig("en-GB")
  try {
    stubFetch(200, { user: { locale: "zh-TW" } })
    await syncLocaleAfterLogin("tok_abc")
    expect(calls[0]?.url).toEndWith("/auth/get-session")
    expect(getLanguage()).toBe("zh-TW")
    expect(settings()).toContain('locale = "zh-TW"')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("after login, an account without a language gets the terminal's", async () => {
  setLanguage("hu-HU")
  stubFetch(200, { user: { locale: null } })
  await syncLocaleAfterLogin("tok_abc")
  expect(calls.map(call => new URL(call.url).pathname)).toEqual(["/auth/get-session", "/auth/update-user"])
  expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ locale: "hu-HU" })
  expect(getLanguage()).toBe("hu-HU")
})

test("a failed session read changes nothing", async () => {
  setLanguage("hu-HU")
  stubFetch(500)
  await syncLocaleAfterLogin("tok_abc")
  expect(calls).toHaveLength(1)
  expect(getLanguage()).toBe("hu-HU")
})
