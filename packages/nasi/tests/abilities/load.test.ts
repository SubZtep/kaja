import { expect, test } from "bun:test"
import type { HttpToolAbility, HttpToolAbilitySchema, McpAbility } from "@kaja/schema/abilities"
import type * as z from "zod"
import { loadAbilities } from "../../src/abilities/load"
import type { AbilityStore } from "../../src/abilities/types"
import { toolName } from "../../src/agent/tools"
import { setWarnHandler } from "../../src/warn"
import { httpAbility as parseHttp, mcpAbility as parseMcp } from "../fixtures/abilities"

const httpAbility = (name: string, auth: z.input<typeof HttpToolAbilitySchema>["auth"] = { type: "none" }) =>
  parseHttp({
    name,
    description: name,
    baseUrl: `https://api.${name}.test`,
    auth,
    tools: [{ name: `${name}_get`, description: "x", path: "/x" }]
  })

const storeWith = (abilities: HttpToolAbility[], mcp: McpAbility[] = []): AbilityStore => ({
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => abilities,
  listMcpAbilities: async () => mcp
})

const mcpAbility = (name: string, keyless = false) =>
  parseMcp({
    name,
    description: name,
    url: `https://mcp.${name}.test/mcp`,
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer ", keyless }
  })

test("each HTTP tool ability becomes a community group tagged with its source", async () => {
  const { groups, httpTools, missingKeys } = await loadAbilities(storeWith([httpAbility("weather")]))
  expect(groups).toHaveLength(1)
  expect(groups[0]).toMatchObject({ origin: "community", source: "ability:weather" })
  expect(groups[0]!.tools.map(toolName)).toEqual(["weather_get"])
  expect(httpTools.map(p => p.name)).toEqual(["weather"])
  expect(missingKeys).toEqual([])
})

test("an ability whose key is missing is left out and reported", async () => {
  const keyed = httpAbility("github", { type: "apiKey", in: "header", name: "Authorization" })
  const without = await loadAbilities(storeWith([keyed]))
  expect(without.groups).toEqual([])
  expect(without.missingKeys).toEqual(["github"])

  const withKey = await loadAbilities(storeWith([keyed]), { getApiKey: name => (name === "github" ? "k" : undefined) })
  expect(withKey.groups).toHaveLength(1)
  expect(withKey.missingKeys).toEqual([])
})

test("every keyed ability is left out without its key, and gets it in its header with one", async () => {
  const keyedHttp = httpAbility("weather", { type: "apiKey", in: "query", name: "key" })
  const loaded = await loadAbilities(storeWith([keyedHttp], [mcpAbility("docs"), mcpAbility("private")]))
  expect(loaded.groups).toEqual([])
  expect(loaded.mcp).toEqual([])
  expect(loaded.missingKeys).toEqual(["weather", "docs", "private"])

  const withKeys = await loadAbilities(storeWith([], [mcpAbility("docs"), mcpAbility("private")]), {
    getApiKey: () => "k"
  })
  expect(
    withKeys.mcp.map(t => [t.name, (t.server as { headers: Record<string, string> }).headers.Authorization])
  ).toEqual([
    ["docs", "Bearer k"],
    ["private", "Bearer k"]
  ])
})

test("a keyless ability loads without its key too, and sends none", async () => {
  const keylessHttp = httpAbility("weather", { type: "apiKey", in: "query", name: "key", keyless: true })
  const loaded = await loadAbilities(storeWith([keylessHttp], [mcpAbility("docs", true), mcpAbility("private")]))
  expect(loaded.groups.map(g => g.source)).toEqual(["ability:weather"])
  expect(loaded.mcp.map(t => t.name)).toEqual(["docs"])
  expect(loaded.mcp[0]!.server).toMatchObject({ headers: {} })
  expect(loaded.missingKeys).toEqual(["private"])
})

test("with warnUnknown, a persona naming a missing ability or tool gets a warning, once each", async () => {
  const warnings: { message: string; payload?: unknown }[] = []
  setWarnHandler((message, payload) => warnings.push({ message, payload }))
  try {
    const store = storeWith([httpAbility("weather")])
    const personas = [
      { id: "a", label: "A", abilities: ["weather", "nope", { name: "weather", tools: ["weather_get", "gone"] }] }
    ]
    await loadAbilities(store, { personas })
    expect(warnings).toEqual([])
    await loadAbilities(store, { personas, warnUnknown: true })
    expect(warnings).toEqual([
      {
        message: "Persona lists tools its ability doesn't offer",
        payload: { persona: "a", ability: "weather", tools: ["gone"] }
      },
      { message: "Persona lists an ability that isn't there", payload: { persona: "a", ability: "nope" } }
    ])
  } finally {
    setWarnHandler(() => {})
  }
})

test("a stdio ability nothing here can start is left out and reported, only when a persona uses it", async () => {
  const time = parseMcp({
    name: "time",
    description: "time",
    transport: "stdio",
    package: { pypi: "mcp-server-time@1.0", docker: "mcp/time:1" }
  })
  const launch = { which: () => null }
  const loaded = await loadAbilities(storeWith([], [time]), { launch })
  expect(loaded.mcp).toEqual([])
  expect(loaded.missingRunners).toEqual([{ name: "time", needs: ["uvx", "pipx", "docker"] }])

  const unused = await loadAbilities(storeWith([], [time]), { launch, personas: [{ id: "a", label: "A" }] })
  expect(unused.missingRunners).toEqual([])

  const withUv = await loadAbilities(storeWith([], [time]), { launch: { which: (p: string) => p } })
  expect(withUv.mcp.map(target => target.server)).toMatchObject([{ id: "time", command: "uvx" }])
})

test("a roots-taking ability gets each persona's folders, and is left out when no persona gives any", async () => {
  const files = parseMcp({ name: "files", description: "f", transport: "stdio", command: "bun", roots: true })
  const launch = { which: (p: string) => p }
  const home = (await import("node:os")).homedir()
  const tmp = (await import("node:os")).tmpdir()
  const personas = [
    { id: "a", label: "A", abilities: [{ name: "files", roots: ["~", tmp] }] },
    { id: "b", label: "B", abilities: ["files"] },
    { id: "c", label: "C" }
  ]
  const loaded = await loadAbilities(storeWith([], [files]), { launch, personas })
  expect(loaded.mcp.map(target => target.roots)).toEqual([{ a: [home, tmp] }])
  expect(loaded.missingRoots).toEqual([])

  const rootless = await loadAbilities(storeWith([], [files]), { launch, personas: personas.slice(1) })
  expect(rootless.mcp).toEqual([])
  expect(rootless.missingRoots).toEqual(["files"])
  expect((await loadAbilities(storeWith([], [files]), { launch })).missingRoots).toEqual([])
})
