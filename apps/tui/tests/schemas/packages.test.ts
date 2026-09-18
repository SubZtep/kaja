import { expect, test } from "bun:test"
import { PackagesFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import TEMPLATE from "../../../../docs/config/packages.toml" with { type: "text" }

const parse = (toml: string) => PackagesFileSchema.parse(TOML.parse(toml))

test("empty file enables nothing", () => {
  expect(parse("")).toEqual({ skills: [], tools: [], mcp: [] })
})

test("the docs/config template parses", () => {
  expect(parse(TEMPLATE)).toEqual({ skills: [], tools: [], mcp: [] })
})

test("skills and a source override round-trip", () => {
  const toml = `
skills = ["pdf", "my-notes"]

[source]
url = "/home/me/src/kaja"
ref = "marketplace-wip"
`
  expect(parse(toml)).toEqual({
    skills: ["pdf", "my-notes"],
    tools: [],
    mcp: [],
    source: { url: "/home/me/src/kaja", ref: "marketplace-wip" }
  })
})

test("an empty skill name is rejected", () => {
  expect(() => parse(`skills = [""]`)).toThrow()
})
