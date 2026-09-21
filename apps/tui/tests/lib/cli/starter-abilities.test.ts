import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TOML, write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-starter-abilities`

const { setConfigDirOverride } = await import("../../../lib/config/config")
const { getAbilitiesPath, getMarketplaceDir } = await import("../../../lib/abilities/abilities-file")
const { applyStarterAbilities } = await import("../../../lib/cli/config-wizard")

let dir: string
const printed: string[] = []

beforeEach(() => {
  dir = `${tmpdir()}/kaja-test-starter-abilities-${Date.now()}-${Math.random().toString(36).slice(2)}`
  setConfigDirOverride(dir)
  printed.length = 0
})

afterEach(() => {
  setConfigDirOverride(undefined)
})

const print = (line: string) => printed.push(line)

test("a machine that already has abilities on is left exactly as it was", async () => {
  const curated = TOML.stringify({ skills: ["mine"] })!
  await write(getAbilitiesPath(), curated)

  await applyStarterAbilities(print)

  expect(await Bun.file(getAbilitiesPath()).text()).toBe(curated)
  expect(printed).toEqual([])
  // Returning early also means the marketplace was never synced — no network, no folder.
  expect(existsSync(getMarketplaceDir())).toBe(false)
})

test("an empty machine gets the keyless starter set", async () => {
  // A lock file marks the marketplace as already synced, so nothing is cloned.
  await write(join(getMarketplaceDir(), ".sync-lock.json"), JSON.stringify({ files: {} }))
  await write(
    join(getMarketplaceDir(), "skills/meeting-notes/SKILL.md"),
    "---\nname: meeting-notes\ndescription: Summarise meeting notes.\n---\n\n# Meeting notes\n"
  )

  await applyStarterAbilities(print)

  expect(TOML.parse(await Bun.file(getAbilitiesPath()).text())).toMatchObject({ skills: ["meeting-notes"] })
  expect(printed.at(-1)).toContain(getAbilitiesPath())
})

test("a turned-off marketplace seeds nothing and never syncs", async () => {
  await write(join(dir, "settings.toml"), TOML.stringify({ marketplace: { enabled: false } })!)

  await applyStarterAbilities(print)

  expect(existsSync(getAbilitiesPath())).toBe(false)
  expect(existsSync(getMarketplaceDir())).toBe(false)
  expect(printed).toEqual([])
})
