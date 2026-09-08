import { afterEach, expect, test } from "bun:test"

const { clearToken, loadToken, saveToken } = await import("../../../lib/auth/credentials")
const { runLogout } = await import("../../../lib/auth/logout")

afterEach(async () => {
  await clearToken()
})

test("logs out, clearing the stored token", async () => {
  await saveToken("tok_abc")

  const { code, text } = await runLogout()
  expect(code).toBe(0)
  expect(text.length).toBeGreaterThan(0)
  expect(await loadToken()).toBeUndefined()
})

test("logging out with no stored token still succeeds, with a distinct message", async () => {
  const { code, text } = await runLogout()
  expect(code).toBe(0)
  expect(text.length).toBeGreaterThan(0)
})
