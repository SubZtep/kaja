import { expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-commands`

const { isSafeCommand } = await import("@kaja/nasi")
const { getCommandsPath, loadSafeCommands } = await import("../../../lib/config/commands")
const { getConfigDir } = await import("../../../lib/config/config")
const { write, file, $ } = await import("bun")

async function reset() {
  await $`rm -rf ${getConfigDir()}`.quiet().nothrow()
}

test("without a commands.toml the built-in list applies, and no file is written", async () => {
  await reset()
  const patterns = await loadSafeCommands()
  expect(isSafeCommand("git status", patterns)).toBe(true)
  expect(isSafeCommand("touch x", patterns)).toBe(false)
  expect(await file(getCommandsPath()).exists()).toBe(false)
})

test("custom patterns are added to the built-in list, and an invalid one is skipped", async () => {
  await reset()
  await write(getCommandsPath(), 'custom = ["npm test", "(bad"]\n')
  const patterns = await loadSafeCommands()
  expect(isSafeCommand("npm test", patterns)).toBe(true)
  expect(isSafeCommand("ls", patterns)).toBe(true)
})

test("an old file's safe list is ignored: the built-in one is the only default", async () => {
  await reset()
  await write(getCommandsPath(), 'safe = ["touch x"]\ncustom = ["npm test"]\n')
  const patterns = await loadSafeCommands()
  expect(isSafeCommand("touch x", patterns)).toBe(false)
  expect(isSafeCommand("npm test", patterns)).toBe(true)
})

test("a broken file falls back to the built-in list", async () => {
  await reset()
  await write(getCommandsPath(), "custom = not toml")
  const patterns = await loadSafeCommands()
  expect(isSafeCommand("ls", patterns)).toBe(true)
})
