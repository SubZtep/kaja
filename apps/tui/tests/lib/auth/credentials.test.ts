import { afterEach, expect, test } from "bun:test"
import { clearToken, loadToken, saveToken } from "../../../lib/auth/credentials"

afterEach(async () => {
  await clearToken()
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
