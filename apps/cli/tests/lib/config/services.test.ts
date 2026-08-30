import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-services`

const { setConfigDirOverride } = await import("../../../lib/config/config")
const { getServicesPath, loadServicesFile, services, invalidateServicesCache } = await import(
  "../../../lib/config/services"
)
const { getSecretsPath, invalidateSecretsCache } = await import("../../../lib/config/secrets")

// Other test files sharing this bun test process may have already cached secrets() with their
// own fixtures — invalidate before every test, not just after, so the first test in this file
// isn't polluted by whichever file happened to run before it. Also clear KAJA_API_URL: a real
// dev .env (apps/cli/.env, auto-loaded by cwd) may set it to point kaja config fetch at a local
// API, which would otherwise override [api].baseUrl in loadServicesFile and break these fixtures.
beforeEach(() => {
  invalidateServicesCache()
  invalidateSecretsCache()
  delete process.env.KAJA_API_URL
})

afterEach(() => {
  setConfigDirOverride(undefined)
  invalidateServicesCache()
  invalidateSecretsCache()
})

async function setup(servicesToml: string, secretsToml: string) {
  const dir = `${tmpdir()}/kaja-test-services-${Math.random()}`
  setConfigDirOverride(dir)
  await write(join(dir, "services.toml"), servicesToml)
  await write(join(dir, "secrets.toml"), secretsToml)
}

test("missing file: writes the template, folds in the default demo secrets", async () => {
  const dir = `${tmpdir()}/kaja-test-services-missing-${Math.random()}`
  setConfigDirOverride(dir)

  expect(await Bun.file(getServicesPath()).exists()).toBe(false)
  const data = await loadServicesFile()

  expect(await Bun.file(getServicesPath()).exists()).toBe(true)
  expect(data.api).toEqual({ baseUrl: "https://api.kaja.io", token: "kaja" })
  expect(data.location).toEqual({ serviceUrl: "https://ip2geo.demo.land", apiKey: "kaja" })
})

test("location: both services.toml and secrets.toml sections present merges into one object", async () => {
  await setup(
    `
[location]
serviceUrl = "https://geo.example.test"
`,
    `
[location]
apiKey = "geo-key"
`
  )
  const { location } = await loadServicesFile()
  expect(location).toEqual({ serviceUrl: "https://geo.example.test", apiKey: "geo-key" })
})

test("location: services.toml section present but secrets.toml section absent drops the feature", async () => {
  await setup(
    `
[location]
serviceUrl = "https://geo.example.test"
`,
    ""
  )
  expect((await loadServicesFile()).location).toBeUndefined()
})

test("location: secrets.toml section present but services.toml section absent drops the feature", async () => {
  await setup(
    "",
    `
[location]
apiKey = "geo-key"
`
  )
  expect((await loadServicesFile()).location).toBeUndefined()
})

test("telegram: both sections present merges allowedUserIds with botToken", async () => {
  await setup(
    `
[telegram]
allowedUserIds = [42]
`,
    `
[telegram]
botToken = "123:abc"
`
  )
  const { telegram } = await loadServicesFile()
  expect(telegram).toEqual({ allowedUserIds: [42], botToken: "123:abc" })
})

test("telegram: services.toml section without a matching secret drops the feature", async () => {
  await setup(
    `
[telegram]
allowedUserIds = [42]
`,
    ""
  )
  expect((await loadServicesFile()).telegram).toBeUndefined()
})

test("api: token is folded in when present, but a missing secrets.toml [api] leaves baseUrl usable with an undefined token", async () => {
  await setup(
    `
[api]
baseUrl = "https://api.example.test"
`,
    ""
  )
  const { api } = await loadServicesFile()
  expect(api).toEqual({ baseUrl: "https://api.example.test", token: undefined })
})

test("api: token is folded in from secrets.toml when both are present", async () => {
  await setup(
    `
[api]
baseUrl = "https://api.example.test"
`,
    `
[api]
token = "shared-secret"
`
  )
  const { api } = await loadServicesFile()
  expect(api).toEqual({ baseUrl: "https://api.example.test", token: "shared-secret" })
})

test("webSearch and zen are secrets-only sections: present in secrets.toml alone is enough", async () => {
  await setup(
    "",
    `
[webSearch]
apiKey = "brave-key"

[zen]
apiKey = "zen-key"
`
  )
  const data = await loadServicesFile()
  expect(data.webSearch).toEqual({ apiKey: "brave-key" })
  expect(data.zen).toEqual({ apiKey: "zen-key" })
})

test("webSearch and zen are undefined when secrets.toml has neither", async () => {
  await setup("", "")
  const data = await loadServicesFile()
  expect(data.webSearch).toBeUndefined()
  expect(data.zen).toBeUndefined()
})

test("services() caches after the first read; invalidateServicesCache() forces a reload", async () => {
  await setup(
    `
[api]
baseUrl = "https://api.example.test"
`,
    `
[api]
token = "first"
`
  )

  const first = await services()
  expect(first.api?.token).toBe("first")

  await write(getSecretsPath(), '[api]\ntoken = "second"\n')
  // Still cached — neither services() nor secrets() have been invalidated.
  expect((await services()).api?.token).toBe("first")

  invalidateSecretsCache()
  invalidateServicesCache()
  expect((await services()).api?.token).toBe("second")
})
