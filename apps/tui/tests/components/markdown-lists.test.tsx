import { expect, test } from "bun:test"
import { Box } from "ink"
import { Marked } from "marked"
import Markdown, { hangingRuns } from "../../src/components/elem/markdown"
import { markedTerminal } from "../../src/lib/markdown/marked-terminal"
import { renderForTest } from "../test-utils"

const parse = (source: string) =>
  Bun.stripANSI(new Marked(markedTerminal({ tab: 2 })).parse(source) as string)
    .split("\n")
    .filter(Boolean)

test("list markers become bullets, nested ones too, and numbers stay", () => {
  expect(parse("* one\n* two\n  * deeper\n")).toEqual(["  • one", "  • two", "    • deeper"])
  expect(parse("1. first\n2. second\n")).toEqual(["  1. first", "  2. second"])
})

test("hangingRuns keeps plain lines together and parts each indented or list line into lead and rest", () => {
  expect(hangingRuns("intro\nstill intro\n  • item\n    more\nafter")).toEqual([
    { lines: "intro\nstill intro" },
    { lead: "  • ", rest: "item" },
    { lead: "    ", rest: "more" },
    { lines: "after" }
  ])
  expect(hangingRuns("  1. first")).toEqual([{ lead: "  1. ", rest: "first" }])
})

test("a wrapped list item hangs under its text, not under the bullet", async () => {
  const t = renderForTest(
    <Box width={30}>
      <Markdown>{"* Load: 4.41 / 4.96 / 4.81, fine for eight cores\n"}</Markdown>
    </Box>,
    { columns: 30 }
  )
  await t.tick()
  const rows = t
    .lastFrame()
    .split("\n")
    .filter(row => row.trim())
  expect(rows[0]!).toStartWith("  • Load:")
  for (const row of rows.slice(1)) expect(row).toStartWith("    ")
  t.unmount()
  await t.waitUntilExit()
})
