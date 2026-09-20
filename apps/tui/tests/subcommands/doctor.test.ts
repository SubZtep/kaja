import { expect, test } from "bun:test"
import { type Tool, tool } from "@kaja/nasi"
import { toolReportLines } from "../../subcommands/doctor"

const named = (name: string, origin: Tool<unknown>["origin"], source?: string): Tool<unknown> => ({
  ...tool({ name, description: name, parameters: { type: "object", properties: {} }, execute: async () => name }),
  origin,
  source
})

test("groups tools by origin, and non-official ones by source", () => {
  const lines = toolReportLines(
    [
      named("read_file", "official"),
      named("web_search", "official"),
      named("weather_forecast", "community", "ability:open-meteo"),
      named("click", "third-party", "mcp:chrome-devtools"),
      named("fill", "third-party", "mcp:chrome-devtools"),
      named("ping", "third-party", "plugin:ping.ts")
    ],
    []
  )
  expect(lines).toEqual([
    "Tools",
    "  Official: read_file, web_search",
    "  Community: weather_forecast [ability:open-meteo]",
    "  Third-party: click, fill [mcp:chrome-devtools]; ping [plugin:ping.ts]"
  ])
})

test("lists skipped tools with the reason", () => {
  const lines = toolReportLines(
    [named("web_search", "official")],
    [
      { name: "web_search", origin: "third-party", source: "mcp:foo", reason: "reserved" },
      { name: "forecast", origin: "third-party", source: "mcp:bar", reason: "taken", takenBy: "ability:a" }
    ]
  )
  expect(lines.slice(2)).toEqual([
    "  Skipped:",
    "    web_search [mcp:foo]: name reserved by Kaja",
    "    forecast [mcp:bar]: name taken by ability:a"
  ])
})

test("prints nothing without tools", () => {
  expect(toolReportLines([], [])).toEqual([])
})
