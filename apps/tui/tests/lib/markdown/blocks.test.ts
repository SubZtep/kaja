import { expect, test } from "bun:test"
import { Marked } from "marked"
import { splitBlocks } from "../../../lib/markdown/blocks"
import { dedent } from "../../../lib/markdown/dedent"
import { markedTerminal } from "../../../lib/markdown/marked-terminal"

const renderer = new Marked(markedTerminal({ tab: 2 }))
const whole = (source: string) => dedent(renderer.parse(source) as string)
const blockByBlock = (source: string) => splitBlocks(source).map(whole).join("\n\n")

// Each renders the same in one go as block by block; the count is how many blocks it splits into
const SAMPLES: [string, string, number][] = [
  ["prose", "# Title\n\nPara one **bold**.\n\nPara two with `code`.\n\n## Sub\n\nText", 5],
  ["loose list", "- a\n- b\n\n- c\n\nafter", 2],
  ["ordered list keeps its numbers", "1. one\n2. two\n\n3. three\n\nend", 2],
  ["list item continuation", "- item\n\n  continued para\n\n- next\n\ntext", 2],
  ["list, paragraph, new list", "- a\n\n- b\n\nNot a list.\n\n- new list", 3],
  ["fence with blank lines", "Look:\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nafter", 3],
  ["fence inside a list item", "1. run:\n\n   ```sh\n   ls\n\n   pwd\n   ```\n\n2. then\n\nok", 2],
  ["tilde fence holding backticks", "~~~\na\n\n```\nb\n~~~\n\nc", 2],
  ["table", "Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nOutro", 3],
  ["indented code", "text\n\n    code line\n\n    more code\n\ntext", 2],
  ["hr after a list", "- a\n\n***\n\ntext", 3],
  ["reference link stays whole", "See [x].\n\n[x]: https://e.com", 1]
]

for (const [name, source, count] of SAMPLES) {
  test(`splitBlocks: ${name}`, () => {
    expect(splitBlocks(source)).toHaveLength(count)
    expect(blockByBlock(source)).toBe(whole(source))
  })
}

test("splitBlocks drops blank edges and returns nothing for blank text", () => {
  expect(splitBlocks("\n\nhello\n\n")).toEqual(["hello"])
  expect(splitBlocks("  \n\n")).toEqual([])
})
