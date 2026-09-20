import { expect, test } from "bun:test"
import { join } from "node:path"
import { McpAbilitySchema } from "@kaja/schema/abilities"
import { mcpAbilityTarget } from "../../src/abilities/mcp-ability"

const parse = (input: Record<string, unknown>) =>
  McpAbilitySchema.parse({ name: "demo", description: "Demo", ...input })

test("the shipped context7 and chrome-devtools manifests are valid", async () => {
  for (const name of ["context7", "chrome-devtools"]) {
    const text = await Bun.file(join(import.meta.dir, `../../../../marketplace/mcp/${name}.toml`)).text()
    expect(McpAbilitySchema.parse(Bun.TOML.parse(text)).name).toBe(name)
  }
})

test("transport decides url vs command and where the key may go", () => {
  const issues = (input: Record<string, unknown>) =>
    McpAbilitySchema.safeParse({ name: "demo", description: "Demo", ...input }).error?.issues.map(i => i.path[0])
  expect(issues({ transport: "stdio" })).toEqual(["command"])
  expect(issues({ transport: "stdio", command: "x", url: "https://a.test" })).toEqual(["url"])
  expect(issues({ url: "https://a.test", command: "x" })).toEqual(["command"])
  expect(issues({ transport: "sse" })).toEqual(["url"])
  expect(issues({ url: "https://a.test", auth: { type: "apiKey", in: "env", name: "K" } })).toEqual(["auth"])
  expect(issues({ transport: "stdio", command: "x", auth: { type: "apiKey", in: "header", name: "K" } })).toEqual([
    "auth"
  ])
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
  expect(mcpAbilityTarget(stdio, "k2")).toEqual({
    name: "demo",
    server: { id: "demo", command: "bunx", args: ["demo-mcp"], env: { MODE: "x", DEMO_KEY: "k2" } },
    transport: "stdio",
    approval: "writes",
    allow: ["a"]
  })
})

test("an optional key that isn't set leaves the header out", () => {
  const ability = parse({
    url: "https://a.test/mcp",
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer ", optional: true }
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
