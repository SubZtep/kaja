import { afterEach, expect, test } from "bun:test"
import { clearToken, loadToken, saveToken } from "../../../lib/auth/credentials"

const EMAIL = "alice@kaja-test.invalid"
const OTHER_EMAIL = "bob@kaja-test.invalid"

afterEach(async () => {
  await clearToken(EMAIL)
  await clearToken(OTHER_EMAIL)
})

test("loadToken returns undefined when nothing is stored", async () => {
  expect(await loadToken(EMAIL)).toBeUndefined()
})

test("saveToken then loadToken round-trips", async () => {
  await saveToken(EMAIL, "tok_abc")
  expect(await loadToken(EMAIL)).toBe("tok_abc")
})

test("clearToken removes the stored token", async () => {
  await saveToken(EMAIL, "tok_abc")
  await clearToken(EMAIL)
  expect(await loadToken(EMAIL)).toBeUndefined()
})

test("tokens for different emails coexist independently", async () => {
  await saveToken(EMAIL, "tok_alice")
  await saveToken(OTHER_EMAIL, "tok_bob")

  expect(await loadToken(EMAIL)).toBe("tok_alice")
  expect(await loadToken(OTHER_EMAIL)).toBe("tok_bob")

  await clearToken(EMAIL)
  expect(await loadToken(EMAIL)).toBeUndefined()
  expect(await loadToken(OTHER_EMAIL)).toBe("tok_bob")
})
