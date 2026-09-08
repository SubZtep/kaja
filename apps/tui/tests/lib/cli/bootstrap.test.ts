import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { TOML, write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-bootstrap`

const { setConfigDirOverride } = await import("../../../lib/config/config")
const { getLanguage, setLanguage } = await import("../../../lib/i18n")
const { detectAndSetLanguage } = await import("../../../lib/cli/bootstrap")

const originalArgv = process.argv
const originalLang = process.env.LANG

afterEach(() => {
  process.argv = originalArgv
  process.env.LANG = originalLang
  setConfigDirOverride(undefined)
  setLanguage("en-GB")
})

test("a saved config preference wins over the OS locale", async () => {
  const dir = `${tmpdir()}/kaja-test-bootstrap-config-${Date.now()}`
  await write(`${dir}/settings.toml`, TOML.stringify({ preferences: { language: "hu" } })!)
  setConfigDirOverride(dir)
  process.env.LANG = "en_US.UTF-8"

  await detectAndSetLanguage()
  expect(getLanguage()).toBe("hu")
})

test("with no config, the OS locale decides", async () => {
  setConfigDirOverride(`${tmpdir()}/kaja-test-bootstrap-no-config-${Date.now()}`)
  process.env.LANG = "hu_HU.UTF-8"

  await detectAndSetLanguage()
  expect(getLanguage()).toBe("hu")
})
