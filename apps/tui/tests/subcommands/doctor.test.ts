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
      named("summarize", "official"),
      named("weather_forecast", "community", "ability:open-meteo"),
      named("click", "community", "ability:chrome-devtools"),
      named("fill", "community", "ability:chrome-devtools")
    ],
    []
  )
  expect(lines).toEqual([
    "Tools",
    "  Official: read_file, summarize",
    "  Community: weather_forecast [ability:open-meteo]; click, fill [ability:chrome-devtools]"
  ])
})

test("lists skipped tools with the reason", () => {
  const lines = toolReportLines(
    [named("summarize", "official")],
    [
      { name: "summarize", origin: "community", source: "ability:foo", reason: "reserved" },
      { name: "forecast", origin: "community", source: "ability:bar", reason: "taken", takenBy: "ability:a" }
    ]
  )
  expect(lines.slice(2)).toEqual([
    "  Skipped:",
    "    summarize [ability:foo]: name reserved by Kaja",
    "    forecast [ability:bar]: name taken by ability:a"
  ])
})

test("prints nothing without tools", () => {
  expect(toolReportLines([], [])).toEqual([])
})
