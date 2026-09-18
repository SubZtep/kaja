import { expect, test } from "bun:test"
import { type HttpToolPackage, HttpToolPackageSchema } from "@kaja/schema/packages"
import { toolName } from "../../src/agent/tools"
import { loadPackages } from "../../src/packages/load"
import type { PackageStore } from "../../src/packages/types"

const httpPackage = (name: string, auth: HttpToolPackage["auth"] = { type: "none" }) =>
  HttpToolPackageSchema.parse({
    name,
    description: name,
    baseUrl: `https://api.${name}.test`,
    auth,
    tools: [{ name: `${name}_get`, description: "x", path: "/x" }]
  })

const storeWith = (packages: HttpToolPackage[]): PackageStore => ({
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => packages
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
