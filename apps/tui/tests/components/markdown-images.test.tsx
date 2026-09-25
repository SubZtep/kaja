import { expect, test } from "bun:test"
import { splitSegments } from "../../components/elem/markdown"

const image = "![Alt](https://example.com/a.jpg)"

test("splits the source around an image", () => {
  expect(splitSegments(`before\n\n${image}\n\nafter`)).toEqual([
    { type: "text", source: "before\n\n" },
    { type: "image", href: "https://example.com/a.jpg", alt: "Alt" },
    { type: "text", source: "\n\nafter" }
  ])
})

test("an earlier copy inside a code block stays code, the real image still splits", () => {
  const fence = `\`\`\`markdown\n${image}\n\`\`\`\n\nOr plainly:\n\n`
  expect(splitSegments(`${fence}${image}`)).toEqual([
    { type: "text", source: fence },
    { type: "image", href: "https://example.com/a.jpg", alt: "Alt" }
  ])
})

test("an image only inside code or a code span is not an image", () => {
  const source = `\`${image}\`\n\n\`\`\`\n${image}\n\`\`\``
  expect(splitSegments(source)).toEqual([{ type: "text", source }])
})
