import { expect, test } from "bun:test"
import { Marked } from "marked"
import { markedTerminal } from "../../../lib/markdown/marked-terminal"
import { type Align, renderTable } from "../../../lib/markdown/table"

const plain = (text: string) => text
const draw = (head: string[], rows: string[][], maxWidth = 80, align: Align[] = []) =>
  renderTable({ head, rows, align, maxWidth, headStyle: plain, borderStyle: plain })

test("draws a rounded table with a rule under the header only", () => {
  expect(
    draw(
      ["Name", "Age"],
      [
        ["Ann", "31"],
        ["Bob", "4"]
      ]
    )
  ).toBe(
    ["╭──────┬─────╮", "│ Name │ Age │", "├──────┼─────┤", "│ Ann  │ 31  │", "│ Bob  │ 4   │", "╰──────┴─────╯"].join(
      "\n"
    )
  )
})

test("follows the column alignment", () => {
  const out = draw(
    ["n", "x"],
    [
      ["12345", "a"],
      ["1", "abc"]
    ],
    80,
    ["right", "center"]
  )
  expect(out).toContain("│ 12345 │  a  │")
  expect(out).toContain("│     1 │ abc │")
})

test("leaves out a header with only empty cells", () => {
  expect(draw(["", ""], [["a", "b"]])).toBe(["╭───┬───╮", "│ a │ b │", "╰───┴───╯"].join("\n"))
})

test("wraps a table wider than maxWidth, with rules between rows once one wraps", () => {
  const out = draw(
    ["Term", "Meaning"],
    [
      ["a", "one two three four five six"],
      ["b", "short"]
    ],
    20
  )
  for (const line of out.split("\n")) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(20)
  expect(out).toContain("│ a    │ one two   │")
  expect(out.split("\n").filter(l => l.startsWith("├"))).toHaveLength(2)
})

test("marked-terminal renders a GFM table with inline markdown in its cells", () => {
  const renderer = new Marked(markedTerminal({ tableWidth: () => 40 }))
  const out = Bun.stripANSI(renderer.parse("| **A** | B |\n|---|--:|\n| `x` | 10 |\n") as string)
  expect(out).toContain("│ A │  B │")
  expect(out).toContain("│ x │ 10 │")
})
