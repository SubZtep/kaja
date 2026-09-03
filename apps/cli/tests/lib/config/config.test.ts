import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TOML, write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config`

const { getConfigDir, getConfigPath, getCurrentUser, readConfigLoose, saveCurrentUser, setConfigDirOverride } =
  await import("../../../lib/config/config")

afterEach(() => {
  setConfigDirOverride(undefined)
})

test("getConfigDir defaults to the env-paths location", () => {
  expect(getConfigDir()).toBe(`${tmpdir()}/kaja-test-xdg-config-config/kaja`)
})

test("setConfigDirOverride redirects getConfigDir and getConfigPath", () => {
  const dir = `${tmpdir()}/kaja-test-config-override`
  setConfigDirOverride(dir)
  expect(getConfigDir()).toBe(dir)
  expect(getConfigPath()).toBe(join(dir, "settings.toml"))

  setConfigDirOverride(undefined)
  expect(getConfigDir()).toBe(`${tmpdir()}/kaja-test-xdg-config-config/kaja`)
})

test("config reads come from the overridden directory", async () => {
  const dir = `${tmpdir()}/kaja-test-config-override-read`
  await write(join(dir, "settings.toml"), TOML.stringify({ preferences: {} })!)
  setConfigDirOverride(dir)
  expect(await readConfigLoose()).toEqual({ preferences: {} })
})

test("getCurrentUser returns undefined when settings.toml doesn't exist yet", async () => {
  setConfigDirOverride(`${tmpdir()}/kaja-test-config-no-user-${Date.now()}`)
  expect(await getCurrentUser()).toBeUndefined()
})

test("saveCurrentUser creates settings.toml when missing, and getCurrentUser reads it back", async () => {
  setConfigDirOverride(`${tmpdir()}/kaja-test-config-save-user-${Date.now()}`)
  await saveCurrentUser("alice@kaja.io")
  expect(await getCurrentUser()).toBe("alice@kaja.io")
})

test("saveCurrentUser merges into existing config without dropping other keys", async () => {
  const dir = `${tmpdir()}/kaja-test-config-merge-user-${Date.now()}`
  await write(join(dir, "settings.toml"), TOML.stringify({ preferences: { thinking: true } })!)
  setConfigDirOverride(dir)
  await saveCurrentUser("bob@kaja.io")
  expect(await readConfigLoose()).toEqual({ preferences: { thinking: true }, user: "bob@kaja.io" })
})
