import { expect, test } from "bun:test"
import { AbilitiesFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import TEMPLATE from "../../../../docs/config/abilities.toml" with { type: "text" }

const parse = (toml: string) => AbilitiesFileSchema.parse(TOML.parse(toml))

test("empty file enables nothing", () => {
  expect(parse("")).toEqual({ skills: [], tools: [], mcp: [], personas: [], disabledTools: {} })
})

test("the docs/config template parses", () => {
  expect(parse(TEMPLATE)).toEqual({ skills: [], tools: [], mcp: [], personas: [], disabledTools: {} })
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
    personas: [],
    disabledTools: {},
    source: { url: "/home/me/src/kaja", ref: "marketplace-wip" }
  })
})

test("an empty skill name is rejected", () => {
  expect(() => parse(`skills = [""]`)).toThrow()
})

test("disabledTools lists tools to leave out, by ability name", () => {
  const toml = `
mcp = ["chrome-devtools"]

[disabledTools]
chrome-devtools = ["click", "fill"]
`
  expect(parse(toml).disabledTools).toEqual({ "chrome-devtools": ["click", "fill"] })
})
