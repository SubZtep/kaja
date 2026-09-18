import { expect, test } from "bun:test"
import { type Tool, tool, toolName } from "../../src/agent/tools"
import { createTools, mergeTools } from "../../src/tools/registry"

const named = (name: string, source?: string): Tool<unknown> => ({
  ...tool({ name, description: name, parameters: { type: "object", properties: {} }, execute: async () => name }),
  ...(source ? { source } : {})
})

test("stamps each group's origin and source onto its tools", () => {
  const { tools, skipped } = mergeTools([
    { origin: "official", tools: [named("ask_user")] },
    { origin: "community", source: "package:open-meteo", tools: [named("weather_forecast")] }
  ])
  expect(tools.map(t => [toolName(t), t.origin, t.source])).toEqual([
    ["ask_user", "official", undefined],
    ["weather_forecast", "community", "package:open-meteo"]
  ])
  expect(skipped).toEqual([])
})

test("a group without a source keeps each tool's own (plugins)", () => {
  const { tools } = mergeTools([{ origin: "third-party", tools: [named("ping", "plugin:ping.ts")] }])
  expect(tools[0]!.source).toBe("plugin:ping.ts")
})

test("official names are reserved, whatever order the groups come in", () => {
  const { tools, skipped } = mergeTools([
    { origin: "third-party", source: "mcp:foo", tools: [named("web_search")] },
    { origin: "official", tools: [named("web_search")] }
  ])
  expect(tools).toHaveLength(1)
  expect(tools[0]!.origin).toBe("official")
  expect(skipped).toEqual([{ name: "web_search", origin: "third-party", source: "mcp:foo", reason: "reserved" }])
})

test("community beats third-party, and the first community tool beats a later one", () => {
  const { tools, skipped } = mergeTools([
    { origin: "third-party", source: "mcp:weather", tools: [named("forecast")] },
    { origin: "community", source: "package:a", tools: [named("forecast")] },
    { origin: "community", source: "package:b", tools: [named("forecast")] }
  ])
  expect(tools.map(t => t.source)).toEqual(["package:a"])
  expect(skipped).toEqual([
    { name: "forecast", origin: "community", source: "package:b", reason: "taken", takenBy: "package:a" },
    { name: "forecast", origin: "third-party", source: "mcp:weather", reason: "taken", takenBy: "package:a" }
  ])
})

test("createTools marks builtins official and drops an extra tool that reuses a builtin name", async () => {
  const { tools, skipped, closeTools } = await createTools({
    includeLocalTools: true,
    extraTools: [{ origin: "community", source: "package:x", tools: [named("read_file"), named("extra_one")] }]
  })
  const byName = new Map(tools.map(t => [toolName(t), t]))
  expect(tools.filter(t => toolName(t) === "read_file")).toHaveLength(1)
  expect(byName.get("read_file")?.origin).toBe("official")
  expect(byName.get("extra_one")?.source).toBe("package:x")
  expect(skipped).toEqual([{ name: "read_file", origin: "community", source: "package:x", reason: "reserved" }])
  await closeTools()
})
