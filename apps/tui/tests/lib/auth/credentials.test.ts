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
