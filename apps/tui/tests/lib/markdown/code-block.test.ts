import { expect, test } from "bun:test"
import { Marked } from "marked"
import { guessLanguage } from "../../../lib/markdown/guess-language"
import { markedTerminal } from "../../../lib/markdown/marked-terminal"

const render = (source: string, max: number) =>
  new Marked(markedTerminal({ codeLines: () => max, codeMore: (n: number) => `+${n} more`, tab: 2 })).parse(
    source
  ) as string

const block = (lines: number) => `\`\`\`\n${Array.from({ length: lines }, (_, i) => `line${i}`).join("\n")}\n\`\`\``

test("a long code block is capped with a count of the hidden lines", () => {
  const out = render(block(10), 4)
  expect(out).toContain("line3")
  expect(out).not.toContain("line4")
  expect(out).toContain("+6 more")
})

test("a block within the cap is shown whole", () => {
  const out = render(block(3), 4)
  expect(out).toContain("line2")
  expect(out).not.toContain("more")
})

test("guessLanguage picks shell, python, typescript and json, and leaves prose plain", () => {
  expect(guessLanguage("$ ls -la")).toBe("bash")
  expect(guessLanguage("import wave, math\n\nSR = 44100")).toBe("python")
  expect(guessLanguage("const a = () => 1")).toBe("typescript")
  expect(guessLanguage('{"a": 1}')).toBe("json")
  expect(guessLanguage("just some words")).toBeUndefined()
})
