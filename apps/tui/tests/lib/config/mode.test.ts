import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-mode`

const { resolveMode, modeFromFlags } = await import("../../../lib/config/mode")
const { getConfigDir, getConfigPath, setConfigDirOverride } = await import("../../../lib/config/config")
const { getModelsPath } = await import("../../../lib/models/models")
const { getSecretsPath, invalidateSecretsCache } = await import("../../../lib/config/secrets")

// Both of these are module-wide and outlive the spec file that set them, so this one reads its own
// config only if it clears them first: an override left behind by another spec would point
// getConfigDir() elsewhere, and a warm secrets() cache would serve that spec's keys. Without this
// the fallback test passed or failed on spec ordering alone.
beforeEach(() => {
  process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-mode`
  setConfigDirOverride(undefined)
  invalidateSecretsCache()
})

afterEach(async () => {
  const { $ } = await import("bun")
  await $`rm -rf ${getConfigDir()}`.quiet().nothrow()
  invalidateSecretsCache()
})

async function writeMode(mode: string) {
  await Bun.write(getConfigPath(), `[preferences]\nmode = "${mode}"\n`)
}

/** A models.toml + secrets.toml pair that hasConfiguredChatModel() accepts. */
async function writeWorkingChatModel() {
  await Bun.write(
    getModelsPath(),
    '[providers.fireworks]\nbase_url = "https://example.invalid/v1"\n\n[tasks]\nchat = "m"\n\n[models.m]\nmodel = "m"\ntasks = ["chat"]\nprovider = "fireworks"\n'
  )
  await Bun.write(getSecretsPath(), '[providers.fireworks]\napi_key = "fw_test"\n')
}

test("--cloud and --local win over everything else", async () => {
  await writeMode("local")
  expect(await resolveMode({ cloud: true })).toBe("cloud")

  await writeMode("cloud")
  expect(await resolveMode({ local: true })).toBe("local")
})

test("preferences.mode is used when no flag is given", async () => {
  await writeMode("local")
  expect(await resolveMode({})).toBe("local")

  await writeMode("cloud")
  expect(await resolveMode({})).toBe("cloud")
})

test("preferences.mode keeps local even with no usable chat model", async () => {
  // The whole point of storing the mode: "Skip — I'll set up models.toml myself" used to send the
  // next launch silently to cloud login, because the mode was guessed from the model being usable.
  await writeMode("local")
  expect(await Bun.file(getModelsPath()).exists()).toBe(false)
  expect(await resolveMode({})).toBe("local")
})

test("without preferences.mode it falls back to guessing from the chat model", async () => {
  await Bun.write(getConfigPath(), '[preferences]\nlocale = "en-GB"\n')
  expect(await resolveMode({})).toBe("cloud")

  await writeWorkingChatModel()
  expect(await resolveMode({})).toBe("local")
})

test("modeFromFlags reports only what a flag forces", () => {
  expect(modeFromFlags({})).toBeUndefined()
  expect(modeFromFlags({ local: true })).toBe("local")
  expect(modeFromFlags({ cloud: true })).toBe("cloud")
  expect(modeFromFlags({ cloud: true, local: true })).toBe("cloud")
})
