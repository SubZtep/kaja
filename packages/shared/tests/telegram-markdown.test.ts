import { expect, test } from "bun:test"
import {
  renderTelegramHtml,
  splitTelegramMessage,
  TELEGRAM_MESSAGE_LIMIT,
  telegramImages,
  truncateForStreaming
} from "../index"

test("bold and italic", () => {
  expect(renderTelegramHtml("**bold** and *italic*")).toBe("<b>bold</b> and <i>italic</i>")
})

test("inline code and fenced code block", () => {
  expect(renderTelegramHtml("use `foo()`")).toBe("use <code>foo()</code>")
  expect(renderTelegramHtml("```js\nconst x = 1\n```")).toBe('<pre><code class="language-js">const x = 1</code></pre>')
})

test("links", () => {
  expect(renderTelegramHtml("[kaja](https://example.test)")).toBe('<a href="https://example.test">kaja</a>')
})

test("unordered and ordered lists", () => {
  expect(renderTelegramHtml("- one\n- two\n- three")).toBe("• one\n• two\n• three")
  expect(renderTelegramHtml("1. one\n2. two")).toBe("1. one\n2. two")
})

test("nested emphasis inside a list item", () => {
  expect(renderTelegramHtml("- **bold** item")).toBe("• <b>bold</b> item")
})

test("blockquote", () => {
  expect(renderTelegramHtml("> quoted text")).toBe("<blockquote>quoted text</blockquote>")
})

test("literal angle brackets and ampersands are escaped", () => {
  expect(renderTelegramHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d")
})

test("headings render bold", () => {
  expect(renderTelegramHtml("# Title")).toBe("<b>Title</b>")
})

test("multiple paragraphs are separated by a blank line", () => {
  expect(renderTelegramHtml("first\n\nsecond")).toBe("first\n\nsecond")
})

test("splitTelegramMessage passes short input through unchanged", () => {
  expect(splitTelegramMessage("short")).toEqual(["short"])
})

test("splitTelegramMessage splits long input into multiple chunks under the limit", () => {
  const html = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join("\n\n")
  const chunks = splitTelegramMessage(html, 100)
  expect(chunks.length).toBeGreaterThan(1)
  for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100)
  expect(chunks.join("\n\n")).toBe(html)
})

test("truncateForStreaming leaves short text alone and trims long text with an ellipsis", () => {
  expect(truncateForStreaming("short")).toBe("short")
  const long = "x".repeat(TELEGRAM_MESSAGE_LIMIT + 500)
  const truncated = truncateForStreaming(long)
  expect(truncated.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT)
  expect(truncated.endsWith("…")).toBe(true)
})

test("an image leaves its alt in the text, and nothing when it has none", () => {
  expect(renderTelegramHtml("Look: ![a <cat>](https://example.test/cat.jpg)")).toBe("Look: a &lt;cat&gt;")
  expect(renderTelegramHtml("Intro\n\n![](https://example.test/cat.jpg)")).toBe("Intro")
})

test("telegramImages lists each image once, in order, skipping code", () => {
  const source = [
    "```markdown\n![code](https://example.test/code.jpg)\n```",
    "`![span](https://example.test/span.jpg)`",
    "![First](https://example.test/1.jpg) and ![Second](/tmp/2.png)",
    "- ![First again](https://example.test/1.jpg)"
  ].join("\n\n")
  expect(telegramImages(source)).toEqual([
    { src: "https://example.test/1.jpg", alt: "First" },
    { src: "/tmp/2.png", alt: "Second" }
  ])
  expect(telegramImages("no images here")).toEqual([])
})
