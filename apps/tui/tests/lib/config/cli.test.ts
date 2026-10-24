import { afterEach, beforeAll, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { setCatalog } from "../../../lib/models/catalog"
import { TEST_CATALOG } from "../../fixtures/catalog"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config-cli`

const { runConfigCli } = await import("../../../lib/config/cli")
const { getConfigDir, getConfigPath } = await import("../../../lib/config/config")
const { getModelsPath } = await import("../../../lib/models/models")
const { getPaths } = await import("../../../lib/paths")
const { join } = await import("node:path")
// Where an old install kept its own MCP servers; fetch must never write it.
const getMcpPath = () => join(getConfigDir(), "mcp.toml")

async function clearCatalog() {
  const { $ } = await import("bun")
  // refreshCatalog() keeps the last catalog in the cache dir, which an unreachable server falls back to
  await $`rm -f ${join(getPaths().cache, "catalog.json")}`.quiet().nothrow()
  setCatalog()
}

beforeAll(clearCatalog)

afterEach(async () => {
  const { $ } = await import("bun")
  await $`rm -f ${getMcpPath()} ${backup(getMcpPath())} ${getModelsPath()} ${backup(getModelsPath())} ${backup(getModelsPath(), 2)} ${getConfigPath()}`
    .quiet()
    .nothrow()
  await $`rm -rf ${getConfigDir()} ${getConfigDir()}.bak ${getConfigDir()}.bak2`.quiet().nothrow()
  await clearCatalog()
})

test("unknown or missing subcommand prints usage and exits 1", async () => {
  for (const argv of [[], ["nope"]]) {
    const { code, text } = await runConfigCli(argv)
    expect(code).toBe(1)
    expect(text).toContain("kaja config fetch")
  }
})

// models.toml → models.bak.toml, then models.bak.2.toml, ...
function backup(path: string, n?: number) {
  return path.replace(/\.toml$/, n ? `.bak.${n}.toml` : ".bak.toml")
}

/** Serves TEST_CATALOG at /config/catalog, and fails any other request. Returns a restore function. */
function mockCatalogFetch() {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(input instanceof Request ? input.url : input)
    expect(url.pathname).toBe("/config/catalog")
    return Response.json(TEST_CATALOG)
  }) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

function failFetch(message: string) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error(message)
  }) as unknown as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

// An Ollama setup whose model the catalog has since replaced, beside a provider of the user's own
const OUTDATED = `[providers.ollama]
base_url = "http://box.local:11434/v1"

[providers.box]
base_url = "https://box.test/v1"

[models.old]
model = "old:model"
provider = "ollama"
tasks = ["chat"]

[models.mine]
model = "mine"
provider = "box"
tasks = ["embedding"]
`

test("fetch rebuilds models.toml from the catalog for the providers it uses, keeping the user's own", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = mockCatalogFetch()
  try {
    const { code, text } = await runConfigCli(["fetch"])
    expect(code).toBe(0)
    expect(text).toContain("models.bak.toml")
  } finally {
    restore()
  }
  const parsed = ModelsFileSchema.parse(TOML.parse(await Bun.file(getModelsPath()).text()))
  expect(parsed.providers.ollama?.base_url).toBe("http://box.local:11434/v1")
  expect(Object.values(parsed.models).find(entry => entry.tasks.includes("chat"))?.model).toBe("qwen3.5:4b")
  expect(parsed.models.mine).toEqual({ model: "mine", provider: "box", tasks: ["embedding"] })
  expect(await Bun.file(backup(getModelsPath())).text()).toBe(OUTDATED)
})

test("a second fetch with nothing new changes nothing and backs nothing up", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = mockCatalogFetch()
  try {
    await runConfigCli(["fetch"])
    const { text } = await runConfigCli(["fetch"])
    expect(text).toContain(`${getModelsPath()} is already up to date`)
  } finally {
    restore()
  }
  expect(await Bun.file(backup(getModelsPath(), 2)).exists()).toBe(false)
})

test("fetch without a models.toml points at the wizard, and writes neither models.toml nor an mcp.toml", async () => {
  const restore = mockCatalogFetch()
  try {
    const { code, text } = await runConfigCli(["fetch"])
    expect(code).toBe(0)
    expect(text).toContain("kaja config wizard")
  } finally {
    restore()
  }
  expect(await Bun.file(getModelsPath()).exists()).toBe(false)
  // MCP servers are marketplace abilities now; there's no mcp.toml to write.
  expect(await Bun.file(getMcpPath()).exists()).toBe(false)
})

test("fetch with --offline never touches the network and leaves models.toml alone", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = failFetch("network should not be used with --offline")
  try {
    const { code, text } = await runConfigCli(["fetch"], { offline: true })
    expect(code).toBe(0)
    expect(text).toContain("there is no provider catalog")
  } finally {
    restore()
  }
  expect(await Bun.file(getModelsPath()).text()).toBe(OUTDATED)
})

test("fetch with the server unreachable and no cached catalog leaves models.toml alone", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = failFetch("connection refused")
  try {
    const { code, text } = await runConfigCli(["fetch"])
    expect(code).toBe(0)
    expect(text).toContain("there is no provider catalog")
  } finally {
    restore()
  }
  expect(await Bun.file(getModelsPath()).text()).toBe(OUTDATED)
})

test("fetch writes secrets.toml from the bundled template, but never settings.toml", async () => {
  await runConfigCli(["fetch"], { offline: true })
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  expect(await Bun.file(getSecretsPath()).exists()).toBe(true)
  expect(await Bun.file(getConfigPath()).exists()).toBe(false)
})

test("fetch leaves a secrets.toml holding keys alone: no backup, nothing overwritten", async () => {
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  const saved = '[providers.fireworks]\napi_key = "fw-secret"\n'
  await Bun.write(getSecretsPath(), saved)

  const { code, text } = await runConfigCli(["fetch"], { offline: true })
  expect(code).toBe(0)
  expect(text).toContain(`${getSecretsPath()} holds your keys`)
  expect(await Bun.file(backup(getSecretsPath())).exists()).toBe(false)
  expect(await Bun.file(getSecretsPath()).text()).toBe(saved)
})

test("fetch leaves a secrets.toml that doesn't parse alone too, since it may still hold keys", async () => {
  const { getSecretsPath } = await import("../../../lib/config/secrets")
  await Bun.write(getSecretsPath(), 'api_key = "half-typed\n')

  const { text } = await runConfigCli(["fetch"], { offline: true })
  expect(text).toContain("holds your keys")
  expect(await Bun.file(getSecretsPath()).text()).toBe('api_key = "half-typed\n')
})

test("wizard --headless writes default config without prompting", async () => {
  const { code, text } = await runConfigCli(["wizard"], { headless: true })
  expect(code).toBe(0)
  expect(text.length).toBeGreaterThan(0)
  expect(await Bun.file(getConfigPath()).exists()).toBe(true)
})

test("diff treats commands.toml as unchanged when only the user's custom patterns differ", async () => {
  await runConfigCli(["fetch", "--offline"], { offline: true })
  const path = join(getConfigDir(), "commands.toml")
  await Bun.write(path, `${await Bun.file(path).text()}\ncustom = ["npm test"]\n`)
  const { text } = await runConfigCli(["diff"], { offline: true })
  expect(text).toContain(path)
  const line = text.split("\n").find(row => row.includes("commands.toml"))!
  expect(line).not.toMatch(/would update|update/i)
})

test("diff says models.toml would update when the catalog has moved on", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = mockCatalogFetch()
  try {
    const { text } = await runConfigCli(["diff"])
    expect(text.split("\n").find(row => row.includes("models.toml"))).toContain("would update")
  } finally {
    restore()
  }
})
