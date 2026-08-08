import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-secrets`

const { setConfigDirOverride, getConfigDir } = await import("../../../lib/config/config")
const { getSecretsPath, loadSecretsFile, readSecretsLoose, secrets, invalidateSecretsCache } = await import(
  "../../../lib/config/secrets"
)

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
  // The shipped template's [api]/[location] ship active (matching services.toml's defaults);
  // everything else ships commented out.
  expect(data.api).toEqual({ token: "kaja" })
  expect(data.location).toEqual({ apiKey: "kaja" })
  expect(data.webSearch).toBeUndefined()
  expect(data.telegram).toBeUndefined()
  expect(data.zen).toBeUndefined()
  expect(data.providers).toEqual({})
})

test("existing file is parsed as-is, not overwritten by the template", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-existing-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "secrets.toml"),
    `
[webSearch]
apiKey = "custom-brave-key"
`
  )

  const data = await loadSecretsFile()
  expect(data.webSearch).toEqual({ apiKey: "custom-brave-key" })
  expect(data.api).toBeUndefined()
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
[location]
apiKey = ""
`
  )

  // Empty string fails SecretsLocationSchema's min(1), but the raw TOML still parses as an object.
  expect(await readSecretsLoose()).toEqual({ location: { apiKey: "" } })
})

test("secrets() caches after the first read; invalidateSecretsCache() forces a reload", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-cache-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "secrets.toml"),
    `
[zen]
apiKey = "first"
`
  )

  const first = await secrets()
  expect(first.zen).toEqual({ apiKey: "first" })

  await write(
    join(dir, "secrets.toml"),
    `
[zen]
apiKey = "second"
`
  )
  // Still cached: rewriting the file on disk alone must not change what secrets() returns.
  expect((await secrets()).zen).toEqual({ apiKey: "first" })
  expect(await secrets()).toBe(first)

  invalidateSecretsCache()
  expect((await secrets()).zen).toEqual({ apiKey: "second" })
})

test("provider and mcp tables default to {} when absent, never undefined", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-defaults-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "secrets.toml"), "")

  const data = await loadSecretsFile()
  expect(data.providers).toEqual({})
  expect(data.mcp).toEqual({})
})

test("getConfigDir affects getSecretsPath the same way it affects the other config files", async () => {
  const dir = `${tmpdir()}/kaja-test-secrets-path-${Math.random()}`
  setConfigDirOverride(dir)
  expect(getSecretsPath()).toBe(join(getConfigDir(), "secrets.toml"))
})
