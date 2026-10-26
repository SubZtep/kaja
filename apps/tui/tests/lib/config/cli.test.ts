import { afterEach, beforeAll, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { setCatalog } from "../../../src/lib/models/catalog"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-config-cli`

const { runConfigCli } = await import("../../../src/lib/config/cli")
const { getConfigDir, getConfigPath } = await import("../../../src/lib/config/config")
const { getModelsPath } = await import("../../../src/lib/models/models")
const { getPaths } = await import("../../../src/lib/paths")
const { join } = await import("node:path")
// Where an old install kept its own MCP servers; fetch must never write it.
const getMcpPath = () => join(getConfigDir(), "mcp.toml")

async function clearCatalog() {
  const { $ } = await import("bun")
  // refreshCatalog() keeps the last catalog in the cache dir, which an unreachable server falls back to
  const cache = getPaths().cache
  await $`rm -f ${join(cache, "models-dev.json")} ${join(cache, "models-dev.etag")}`.quiet().nothrow()
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

// models.dev as the tests see it: Fireworks has moved to a new address, and now says how much its model reads
const REGISTRY = {
  "fireworks-ai": {
    id: "fireworks-ai",
    name: "Fireworks",
    api: "https://api.fireworks.ai/inference/v1/",
    env: ["FIREWORKS_API_KEY"],
    models: {
      "accounts/fireworks/models/minimax-m3": {
        id: "accounts/fireworks/models/minimax-m3",
        tool_call: true,
        modalities: { input: ["text", "image"], output: ["text"] },
        limit: { context: 196608 }
      }
    }
  }
}

/** Serves REGISTRY as models.dev, and fails any other request. Returns a restore function. */
function mockCatalogFetch() {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(input instanceof Request ? input.url : input)
    expect(url.href).toBe("https://models.dev/api.json")
    return Response.json(REGISTRY)
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

// A Fireworks setup from before the catalog moved on, beside a provider of the user's own
const OUTDATED = `[providers.fireworks-ai]
base_url = "https://old.fireworks.test/v1"

[providers.box]
base_url = "https://box.test/v1"

[models.minimax-m3]
model = "accounts/fireworks/models/minimax-m3"
provider = "fireworks-ai"
tasks = ["chat", "vision"]

[models.mine]
model = "mine"
provider = "box"
tasks = ["embedding"]
`

test("fetch brings models.toml's catalog providers up to date, keeping every pick and the user's own", async () => {
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
  expect(parsed.providers["fireworks-ai"]?.base_url).toBe("https://api.fireworks.ai/inference/v1")
  expect(parsed.models["minimax-m3"]).toEqual({
    model: "accounts/fireworks/models/minimax-m3",
    provider: "fireworks-ai",
    tasks: ["chat", "vision"],
    context_window: 196608
  })
  expect(parsed.models.mine).toEqual({ model: "mine", provider: "box", tasks: ["embedding"] })
  expect(await Bun.file(backup(getModelsPath())).text()).toBe(OUTDATED)
})

test("a provider models.toml names differently, at the catalog's address, keeps its name", async () => {
  await Bun.write(
    getModelsPath(),
    OUTDATED.replaceAll("fireworks-ai", "fireworks").replace(
      "https://old.fireworks.test/v1",
      "https://api.fireworks.ai/inference/v1"
    )
  )
  const restore = mockCatalogFetch()
  try {
    await runConfigCli(["fetch"])
  } finally {
    restore()
  }
  const parsed = ModelsFileSchema.parse(TOML.parse(await Bun.file(getModelsPath()).text()))
  expect(Object.keys(parsed.providers).sort()).toEqual(["box", "fireworks"])
  // Recognised as models.dev's Fireworks, so what models.dev knows about its model is filled in
  expect(parsed.models["minimax-m3"]?.context_window).toBe(196608)
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

test("fetch writes only models.toml: never settings.toml, secrets.toml or commands.toml", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = mockCatalogFetch()
  try {
    await runConfigCli(["fetch"])
  } finally {
    restore()
  }
  for (const name of ["settings.toml", "secrets.toml", "commands.toml"])
    expect(await Bun.file(join(getConfigDir(), name)).exists()).toBe(false)
})

test("a file fetch writes points at the schema copy it puts beside it", async () => {
  await Bun.write(getModelsPath(), OUTDATED)
  const restore = mockCatalogFetch()
  try {
    await runConfigCli(["fetch"])
  } finally {
    restore()
  }
  expect(await Bun.file(getModelsPath()).text()).toStartWith("#:schema ./schemas/models.json\n")
  const schema = await Bun.file(join(getConfigDir(), "schemas", "models.json")).json()
  expect(schema.properties.models).toBeDefined()
})

test("wizard --headless writes default config without prompting", async () => {
  const { code, text } = await runConfigCli(["wizard"], { headless: true })
  expect(code).toBe(0)
  expect(text.length).toBeGreaterThan(0)
  expect(await Bun.file(getConfigPath()).text()).toStartWith("#:schema ./schemas/settings.json\n")
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
