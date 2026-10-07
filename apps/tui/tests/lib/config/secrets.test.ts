import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-secrets`

const { setConfigDirOverride, getConfigDir } = await import("../../../lib/config/config")
const {
  getSecretsPath,
  loadSecretsFile,
  readSecretPlaceholders,
  readSecretsLoose,
  saveSecrets,
  secrets,
  secretsText,
  invalidateSecretsCache,
  updateSecretPlaceholders
} = await import("../../../lib/config/secrets")

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
  expect(data.abilities).toEqual({})
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

test("provider and ability tables default to {} when absent, never undefined", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-defaults-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "secrets.toml"), "")

  const data = await loadSecretsFile()
  expect(data.providers).toEqual({})
  expect(data.abilities).toEqual({})
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

const OFF = { group: "abilities", name: "web-search", note: "Off until it has a key." } as const
const KEYLESS = { group: "abilities", name: "context7" } as const

test("unset keys are written as commented-out tables in their group, and read back", () => {
  const text = secretsText({ providers: { fireworks: { api_key: "fw" } }, abilities: {} }, [
    OFF,
    KEYLESS,
    { group: "providers", name: "xai" }
  ])
  expect(text).toBe(
    '[providers]\n  [providers.fireworks]\n  api_key = "fw"\n\n  # [providers.xai]\n  # api_key = ""\n\n' +
      '# [abilities]\n  # Off until it has a key.\n  # [abilities.web-search]\n  # api_key = ""\n\n' +
      '  # [abilities.context7]\n  # api_key = ""\n'
  )
  // Comments only: nothing a placeholder says reaches the parsed file.
  expect(Bun.TOML.parse(text)).toEqual({ providers: { fireworks: { api_key: "fw" } } })
  expect(readSecretPlaceholders(text)).toEqual([{ group: "providers", name: "xai" }, OFF, KEYLESS])
})

test("the template's commented examples hold sample values, so they aren't placeholders", () => {
  expect(readSecretPlaceholders('# [providers.fireworks]\n# api_key = "fw_YourSecretKey"\n')).toEqual([])
})

test("saving keeps the placeholders, and one that gets its key turns into the real table", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-placeholders-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "secrets.toml"), "")
  await updateSecretPlaceholders([OFF, KEYLESS])

  await saveSecrets({ telegram: { bot_token: "t" } })
  expect(readSecretPlaceholders(await Bun.file(getSecretsPath()).text())).toEqual([OFF, KEYLESS])

  await saveSecrets({ abilities: { "web-search": { api_key: "b" } } })
  const text = await Bun.file(getSecretsPath()).text()
  expect(readSecretPlaceholders(text)).toEqual([KEYLESS])
  expect((await loadSecretsFile()).abilities).toEqual({ "web-search": { api_key: "b" } })
})

test("updating to the placeholders the file already holds leaves it untouched", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-placeholders-same-${Math.random()}`
  setConfigDirOverride(dir)
  const template = "# Hand-written notes stay while nothing changes\n"
  await write(join(dir, "secrets.toml"), template)
  await updateSecretPlaceholders([])
  expect(await Bun.file(getSecretsPath()).text()).toBe(template)
})
