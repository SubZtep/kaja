import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"
import { stringify } from "smol-toml"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config`

const { getConfigDir, getConfigPath, readConfigLoose, setConfigDirOverride } = await import(
  "../../../lib/config/config"
)

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
  await write(join(dir, "settings.toml"), stringify({ preferences: {} }))
  setConfigDirOverride(dir)
  expect(await readConfigLoose()).toEqual({ preferences: {} })
})
