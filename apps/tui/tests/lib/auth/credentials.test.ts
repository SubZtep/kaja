import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { clearToken, loadToken, saveToken } from "../../../lib/auth/credentials"

// In-memory stand-in for the OS credential store, so tests never touch (or wipe) the real TUI login token
const store = new Map<string, string>()
const key = (options: { service: string; name: string }) => `${options.service}/${options.name}`
spyOn(Bun.secrets, "get").mockImplementation(async options => store.get(key(options)) ?? null)
spyOn(Bun.secrets, "set").mockImplementation(async options => {
  store.set(key(options), options.value)
})
spyOn(Bun.secrets, "delete").mockImplementation(async options => store.delete(key(options)))

beforeEach(() => {
  store.clear()
})

afterAll(() => {
  mock.restore()
})

test("loadToken returns undefined when nothing is stored", async () => {
  expect(await loadToken()).toBeUndefined()
})

test("saveToken then loadToken round-trips", async () => {
  await saveToken("tok_abc")
  expect(await loadToken()).toBe("tok_abc")
})

test("clearToken removes the stored token", async () => {
  await saveToken("tok_abc")
  await clearToken()
  expect(await loadToken()).toBeUndefined()
})

test("a KAJA_PROFILE keeps its own token", async () => {
  await saveToken("tok_default")
  Bun.env.KAJA_PROFILE = "second"
  try {
    // A query string makes Bun evaluate the module again, now seeing the profile
    const specifier = "../../../lib/auth/credentials?profile=second"
    const second = (await import(specifier)) as typeof import("../../../lib/auth/credentials")
    expect(await second.loadToken()).toBeUndefined()
    await second.saveToken("tok_second")
    expect(await loadToken()).toBe("tok_default")
  } finally {
    delete Bun.env.KAJA_PROFILE
  }
})
