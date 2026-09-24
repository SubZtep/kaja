import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-secrets`

const { setConfigDirOverride, getConfigDir } = await import("../../../lib/config/config")
const { getSecretsPath, loadSecretsFile, readSecretsLoose, saveSecrets, secrets, invalidateSecretsCache } =
  await import("../../../lib/config/secrets")

// Other test files sharing this bun test process may have already cached secrets() with their
// own fixtures — invalidate before every test, not just after.
beforeEach(() => {
  invalidateSecretsCache()
})

afterEach(() => {
  setConfigDirOverride(undefined)
  invalidateSecretsCache()
})

test("missing file: writes the template and returns its active (non-commented) sections", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-missing-${Math.random()}`
  setConfigDirOverride(dir)

  expect(await Bun.file(getSecretsPath()).exists()).toBe(false)
  const data = await loadSecretsFile()

  expect(await Bun.file(getSecretsPath()).exists()).toBe(true)
  // Every section in the shipped template is commented out.
  expect(data.mcp).toEqual({})
  expect(data.telegram).toBeUndefined()
  expect(data.providers).toEqual({})
})

test("existing file is parsed as-is, not overwritten by the template", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-existing-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "secrets.toml"),
    `
[telegram]
bot_token = "custom-token"
`
  )

  const data = await loadSecretsFile()
  expect(data.telegram).toEqual({ bot_token: "custom-token", owner_ids: [] })
})

test("readSecretsLoose returns {} when the file is missing, without writing anything", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-loose-missing-${Math.random()}`
  setConfigDirOverride(dir)

  expect(await readSecretsLoose()).toEqual({})
  expect(await Bun.file(getSecretsPath()).exists()).toBe(false)
})

test("readSecretsLoose returns {} on unparseable TOML instead of throwing", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-loose-invalid-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "secrets.toml"), "[section\nkey = ")

  expect(await readSecretsLoose()).toEqual({})
})

test("readSecretsLoose returns whatever is on disk even if it fails schema validation", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-loose-schema-invalid-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "secrets.toml"),
    `
[telegram]
bot_token = ""
`
  )

  // Empty string fails SecretsTelegramSchema's min(1), but the raw TOML still parses as an object.
  expect<unknown>(await readSecretsLoose()).toEqual({ telegram: { bot_token: "" } })
})

test("secrets() caches after the first read; invalidateSecretsCache() forces a reload", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-cache-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "secrets.toml"),
    `
[telegram]
bot_token = "first"
`
  )

  const first = await secrets()
  expect(first.telegram).toEqual({ bot_token: "first", owner_ids: [] })

  await write(
    join(dir, "secrets.toml"),
    `
[telegram]
bot_token = "second"
`
  )
  // Still cached: rewriting the file on disk alone must not change what secrets() returns.
  expect((await secrets()).telegram).toEqual({ bot_token: "first", owner_ids: [] })
  expect(await secrets()).toBe(first)

  invalidateSecretsCache()
  expect((await secrets()).telegram).toEqual({ bot_token: "second", owner_ids: [] })
})

test("provider and mcp tables default to {} when absent, never undefined", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-defaults-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "secrets.toml"), "")

  const data = await loadSecretsFile()
  expect(data.providers).toEqual({})
  expect(data.mcp).toEqual({})
})

test("saveSecrets merges [telegram]: a new token keeps the owners, and pairing keeps the token", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-telegram-merge-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "secrets.toml"), `[telegram]\nbot_token = "old"\nowner_ids = [42]\n`)

  await saveSecrets({ telegram: { bot_token: "new" } })
  expect((await loadSecretsFile()).telegram).toEqual({ bot_token: "new", owner_ids: [42] })

  await saveSecrets({ telegram: { owner_ids: [42, 7] } })
  expect((await loadSecretsFile()).telegram).toEqual({ bot_token: "new", owner_ids: [42, 7] })
})

test("getConfigDir affects getSecretsPath the same way it affects the other config files", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-path-${Math.random()}`
  setConfigDirOverride(dir)
  expect(getSecretsPath()).toBe(join(getConfigDir(), "secrets.toml"))
})
