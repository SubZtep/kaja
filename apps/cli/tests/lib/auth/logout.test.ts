import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-logout`

const { clearToken, loadToken, saveToken } = await import("../../../lib/auth/credentials")
const { runLogout } = await import("../../../lib/auth/logout")
const { getCurrentUser, saveCurrentUser, setConfigDirOverride } = await import("../../../lib/config/config")

const EMAIL = "alice@kaja-test.invalid"
const OTHER_EMAIL = "bob@kaja-test.invalid"

afterEach(async () => {
  await clearToken(EMAIL)
  await clearToken(OTHER_EMAIL)
  setConfigDirOverride(undefined)
})

test("logs out the saved current user, clearing both the token and the saved user", async () => {
  const dir = `${tmpdir()}/kaja-test-logout-current-${Date.now()}`
  setConfigDirOverride(dir)
  await saveToken(EMAIL, "tok_abc")
  await saveCurrentUser(EMAIL)

  const { code, text } = await runLogout(undefined)
  expect(code).toBe(0)
  expect(text).toContain(EMAIL)
  expect(await loadToken(EMAIL)).toBeUndefined()
  expect(await getCurrentUser()).toBeUndefined()
})

test("--user targets a specific account without touching the saved current user", async () => {
  const dir = `${tmpdir()}/kaja-test-logout-other-${Date.now()}`
  setConfigDirOverride(dir)
  await saveToken(EMAIL, "tok_current")
  await saveToken(OTHER_EMAIL, "tok_other")
  await saveCurrentUser(EMAIL)

  const { code } = await runLogout(OTHER_EMAIL)
  expect(code).toBe(0)
  expect(await loadToken(OTHER_EMAIL)).toBeUndefined()
  expect(await loadToken(EMAIL)).toBe("tok_current")
  expect(await getCurrentUser()).toBe(EMAIL)
})

test("logging out an account with no stored token still succeeds, with a distinct message", async () => {
  setConfigDirOverride(`${tmpdir()}/kaja-test-logout-notsignedin-${Date.now()}`)

  const { code, text } = await runLogout(EMAIL)
  expect(code).toBe(0)
  expect(text).toContain(EMAIL)
})

test("no --user and no saved current user fails with a helpful message", async () => {
  setConfigDirOverride(`${tmpdir()}/kaja-test-logout-nouser-${Date.now()}`)

  const { code, text } = await runLogout(undefined)
  expect(code).toBe(1)
  expect(text.length).toBeGreaterThan(0)
})
