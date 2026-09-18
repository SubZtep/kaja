import { expect, test } from "bun:test"
import { type HttpToolPackage, HttpToolPackageSchema, type McpPackage, McpPackageSchema } from "@kaja/schema/packages"
import type * as z from "zod"
import { toolName } from "../../src/agent/tools"
import { loadPackages } from "../../src/packages/load"
import type { PackageStore } from "../../src/packages/types"

const httpPackage = (name: string, auth: z.input<typeof HttpToolPackageSchema>["auth"] = { type: "none" }) =>
  HttpToolPackageSchema.parse({
    name,
    description: name,
    baseUrl: `https://api.${name}.test`,
    auth,
    tools: [{ name: `${name}_get`, description: "x", path: "/x" }]
  })

const storeWith = (packages: HttpToolPackage[], mcp: McpPackage[] = []): PackageStore => ({
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => packages,
  listMcpPackages: async () => mcp
})

const mcpPackage = (name: string, optional: boolean) =>
  McpPackageSchema.parse({
    name,
    description: name,
    url: `https://mcp.${name}.test/mcp`,
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer ", optional }
  })

test("each HTTP tool package becomes a community group tagged with its source", async () => {
  const { groups, httpTools, missingKeys } = await loadPackages(storeWith([httpPackage("weather")]))
  expect(groups).toHaveLength(1)
  expect(groups[0]).toMatchObject({ origin: "community", source: "package:weather" })
  expect(groups[0]!.tools.map(toolName)).toEqual(["weather_get"])
  expect(httpTools.map(p => p.name)).toEqual(["weather"])
  expect(missingKeys).toEqual([])
})

test("a package whose key is missing is left out and reported", async () => {
  const keyed = httpPackage("github", { type: "apiKey", in: "header", name: "Authorization" })
  const without = await loadPackages(storeWith([keyed]))
  expect(without.groups).toEqual([])
  expect(without.missingKeys).toEqual(["github"])

  const withKey = await loadPackages(storeWith([keyed]), { getApiKey: name => (name === "github" ? "k" : undefined) })
  expect(withKey.groups).toHaveLength(1)
  expect(withKey.missingKeys).toEqual([])
})

test("an optional key may be missing; a required one leaves the package out", async () => {
  const optionalHttp = httpPackage("weather", { type: "apiKey", in: "query", name: "key", optional: true })
  const loaded = await loadPackages(storeWith([optionalHttp], [mcpPackage("docs", true), mcpPackage("private", false)]))
  expect(loaded.groups.map(g => g.source)).toEqual(["package:weather"])
  expect(loaded.mcp.map(t => t.name)).toEqual(["docs"])
  expect(loaded.mcp[0]!.server).toMatchObject({ headers: {} })
  expect(loaded.missingKeys).toEqual(["private"])

  const withKeys = await loadPackages(storeWith([], [mcpPackage("docs", true), mcpPackage("private", false)]), {
    getApiKey: () => "k"
  })
  expect(
    withKeys.mcp.map(t => [t.name, (t.server as { headers: Record<string, string> }).headers.Authorization])
  ).toEqual([
    ["docs", "Bearer k"],
    ["private", "Bearer k"]
  ])
})
