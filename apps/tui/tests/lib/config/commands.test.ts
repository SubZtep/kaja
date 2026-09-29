import { expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-commands`

const { DEFAULT_SAFE_COMMANDS, isSafeCommand } = await import("@kaja/nasi")
const { fetchCommandsToml, getCommandsPath, loadSafeCommands } = await import("../../../lib/config/commands")
const { getConfigDir } = await import("../../../lib/config/config")
const { TOML, write, file, $ } = await import("bun")
const TEMPLATE = (await import("../../../../../docs/config/commands.toml", { with: { type: "text" } })).default

async function reset() {
  await $`rm -rf ${getConfigDir()}`.quiet().nothrow()
}

test("the template's safe list is the built-in default", () => {
  expect((TOML.parse(TEMPLATE) as { safe: string[] }).safe).toEqual([...DEFAULT_SAFE_COMMANDS])
})

test("a missing file is written from the template, and its patterns load", async () => {
  await reset()
  const patterns = await loadSafeCommands()
  expect(await file(getCommandsPath()).exists()).toBe(true)
  expect(isSafeCommand("git status", patterns)).toBe(true)
  expect(isSafeCommand("touch x", patterns)).toBe(false)
})

test("custom patterns are added, and an invalid one is skipped", async () => {
  await reset()
  await write(getCommandsPath(), 'safe = ["pwd"]\ncustom = ["npm test", "(bad"]\n')
  const patterns = await loadSafeCommands()
  expect(isSafeCommand("npm test", patterns)).toBe(true)
  expect(isSafeCommand("pwd", patterns)).toBe(true)
  expect(isSafeCommand("ls", patterns)).toBe(false)
})

test("a broken file falls back to the built-in list", async () => {
  await reset()
  await write(getCommandsPath(), "safe = not toml")
  const patterns = await loadSafeCommands()
  expect(isSafeCommand("ls", patterns)).toBe(true)
})

test("fetch refreshes the defaults but keeps the user's custom patterns", async () => {
  await reset()
  await write(getCommandsPath(), 'safe = ["old"]\ncustom = ["npm test"]\n')
  const result = await fetchCommandsToml()
  expect(result.backedUpTo).toBeDefined()
  const saved = TOML.parse(await file(getCommandsPath()).text()) as { safe: string[]; custom: string[] }
  expect(saved.safe).toEqual([...DEFAULT_SAFE_COMMANDS])
  expect(saved.custom).toEqual(["npm test"])
})
