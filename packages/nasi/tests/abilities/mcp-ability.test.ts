import { expect, test } from "bun:test"
import { McpAbilitySchema } from "@kaja/schema/abilities"
import { mcpAbilityTarget } from "../../src/abilities/mcp-ability"
import { McpRunnerMissingError } from "../../src/mcp/launch"
import { mcpAbility } from "../fixtures/abilities"

const parse = (input: Record<string, unknown>) => mcpAbility({ name: "demo", description: "Demo", ...input })

test("transport decides url vs command and where the key may go", () => {
  const issues = (input: Record<string, unknown>) =>
    McpAbilitySchema.safeParse({ description: "Demo", ...input }).error?.issues.map(i => i.path[0])
  expect(issues({ transport: "stdio" })).toEqual(["command"])
  expect(issues({ transport: "stdio", command: "x", url: "https://a.test" })).toEqual(["url"])
  expect(issues({ url: "https://a.test", command: "x" })).toEqual(["command"])
  expect(issues({ transport: "sse" })).toEqual(["url"])
  expect(issues({ url: "https://a.test", auth: { type: "apiKey", in: "env", name: "K" } })).toEqual(["auth"])
  expect(issues({ transport: "stdio", command: "x", auth: { type: "apiKey", in: "header", name: "K" } })).toEqual([
    "auth"
  ])
  expect(issues({ transport: "stdio", command: "x", package: { npm: "y" } })).toEqual(["package"])
  expect(issues({ url: "https://a.test", package: { npm: "y" } })).toEqual(["package"])
  expect(issues({ transport: "stdio", package: {} })).toEqual(["package"])
  expect(issues({ transport: "stdio", package: { npm: "--eval=x" } })).toEqual(["package"])
  expect(parse({ url: "https://a.test" })).toMatchObject({
    transport: "http",
    approval: "never",
    auth: { type: "none" }
  })
})

test("the key lands in the header (with prefix) or env var, next to the static ones", () => {
  const http = parse({
    url: "https://a.test/mcp",
    headers: { Accept: "application/json" },
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " }
  })
  expect(mcpAbilityTarget(http, "k1").server).toEqual({
    id: "demo",
    url: "https://a.test/mcp",
    headers: { Accept: "application/json", Authorization: "Bearer k1" }
  })
  const stdio = parse({
    transport: "stdio",
    command: "bunx",
    args: ["demo-mcp"],
    env: { MODE: "x" },
    auth: { type: "apiKey", in: "env", name: "DEMO_KEY" },
    approval: "writes",
    tools: ["a"]
  })
  expect(mcpAbilityTarget(stdio, "k2", { which: program => program })).toEqual({
    name: "demo",
    server: { id: "demo", command: "bunx", args: ["demo-mcp"], env: { MODE: "x", DEMO_KEY: "k2" } },
    transport: "stdio",
    approval: "writes",
    allow: ["a"]
  })
})

test("without a key the header is left out", () => {
  const ability = parse({
    url: "https://a.test/mcp",
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " }
  })
  expect(mcpAbilityTarget(ability).server).toEqual({ id: "demo", url: "https://a.test/mcp", headers: {} })
})

test("readOnly shorthand names expand to rules with no `unless`", () => {
  const ability = parse({
    url: "https://a.test/mcp",
    approval: "writes",
    readOnly: ["list_things", { tool: "snapshot", unless: ["filePath"] }]
  })
  expect(mcpAbilityTarget(ability).readOnly).toEqual([
    { tool: "list_things", unless: [] },
    { tool: "snapshot", unless: ["filePath"] }
  ])
})

test("a stdio ability nothing here can start throws, naming what to install", () => {
  const time = parse({ transport: "stdio", package: { pypi: "mcp-server-time@1.0" } })
  expect(() => mcpAbilityTarget(time, undefined, { which: () => null })).toThrow(McpRunnerMissingError)
})
