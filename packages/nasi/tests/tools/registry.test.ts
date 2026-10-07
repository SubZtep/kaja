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
    { origin: "community", source: "ability:open-meteo", tools: [named("weather_forecast")] }
  ])
  expect(tools.map(t => [toolName(t), t.origin, t.source])).toEqual([
    ["ask_user", "official", undefined],
    ["weather_forecast", "community", "ability:open-meteo"]
  ])
  expect(skipped).toEqual([])
})

test("a group without a source keeps each tool's own", () => {
  const { tools } = mergeTools([{ origin: "community", tools: [named("ping", "ability:ping")] }])
  expect(tools[0]!.source).toBe("ability:ping")
})

test("official names are reserved, whatever order the groups come in", () => {
  const { tools, skipped } = mergeTools([
    { origin: "community", source: "ability:foo", tools: [named("summarize")] },
    { origin: "official", tools: [named("summarize")] }
  ])
  expect(tools).toHaveLength(1)
  expect(tools[0]!.origin).toBe("official")
  expect(skipped).toEqual([{ name: "summarize", origin: "community", source: "ability:foo", reason: "reserved" }])
})

test("the first community tool with a name beats a later one", () => {
  const { tools, skipped } = mergeTools([
    { origin: "community", source: "ability:a", tools: [named("forecast")] },
    { origin: "community", source: "ability:b", tools: [named("forecast")] }
  ])
  expect(tools.map(t => t.source)).toEqual(["ability:a"])
  expect(skipped).toEqual([
    { name: "forecast", origin: "community", source: "ability:b", reason: "taken", takenBy: "ability:a" }
  ])
})

test("createTools marks builtins official and drops an extra tool that reuses a builtin name", async () => {
  const { tools, skipped, closeTools } = await createTools({
    includeLocalTools: true,
    extraTools: [{ origin: "community", source: "ability:x", tools: [named("read_file"), named("extra_one")] }]
  })
  const byName = new Map(tools.map(t => [toolName(t), t]))
  expect(tools.filter(t => toolName(t) === "read_file")).toHaveLength(1)
  expect(byName.get("read_file")?.origin).toBe("official")
  expect(byName.get("extra_one")?.source).toBe("ability:x")
  expect(skipped).toEqual([{ name: "read_file", origin: "community", source: "ability:x", reason: "reserved" }])
  await closeTools()
})
