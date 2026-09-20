import { expect, test } from "bun:test"
import { type HttpToolAbility, HttpToolAbilitySchema, type McpAbility, McpAbilitySchema } from "@kaja/schema/abilities"
import type * as z from "zod"
import { loadAbilities } from "../../src/abilities/load"
import type { AbilityStore } from "../../src/abilities/types"
import { toolName } from "../../src/agent/tools"

const httpAbility = (name: string, auth: z.input<typeof HttpToolAbilitySchema>["auth"] = { type: "none" }) =>
  HttpToolAbilitySchema.parse({
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

const mcpAbility = (name: string, optional: boolean) =>
  McpAbilitySchema.parse({
    name,
    description: name,
    url: `https://mcp.${name}.test/mcp`,
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer ", optional }
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

test("an optional key may be missing; a required one leaves the ability out", async () => {
  const optionalHttp = httpAbility("weather", { type: "apiKey", in: "query", name: "key", optional: true })
  const loaded = await loadAbilities(
    storeWith([optionalHttp], [mcpAbility("docs", true), mcpAbility("private", false)])
  )
  expect(loaded.groups.map(g => g.source)).toEqual(["ability:weather"])
  expect(loaded.mcp.map(t => t.name)).toEqual(["docs"])
  expect(loaded.mcp[0]!.server).toMatchObject({ headers: {} })
  expect(loaded.missingKeys).toEqual(["private"])

  const withKeys = await loadAbilities(storeWith([], [mcpAbility("docs", true), mcpAbility("private", false)]), {
    getApiKey: () => "k"
  })
  expect(
    withKeys.mcp.map(t => [t.name, (t.server as { headers: Record<string, string> }).headers.Authorization])
  ).toEqual([
    ["docs", "Bearer k"],
    ["private", "Bearer k"]
  ])
})
