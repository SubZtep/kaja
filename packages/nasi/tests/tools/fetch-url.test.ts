import { afterEach, expect, test } from "bun:test"
import { fetchUrlTool, largestInSrcset, pageMarkdown } from "../../src/tools/builtin/fetch-url"
import { getToolDeps, setToolDeps } from "../../src/tools/deps"

// A public-looking URL through a sender pointed at a local Bun.serve, as in ssrf-size.test.ts
const PUBLIC_URL = "http://172.32.0.1/cat.jpg"
const saved = getToolDeps()

afterEach(() => setToolDeps(saved))

async function fetchFrom(response: Response, args: Record<string, boolean> = {}) {
  const origin = Bun.serve({ port: 0, fetch: () => response })
  setToolDeps({ ...saved, fetchSend: (_url, init) => fetch(`http://127.0.0.1:${origin.port}/`, init) })
  try {
    return await fetchUrlTool.execute({ url: PUBLIC_URL, ...args })
  } finally {
    await origin.stop(true)
  }
}

test("an image URL comes back as the image, for the conversation to keep and show", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  const result = await fetchFrom(new Response(bytes, { headers: { "content-type": "image/jpeg" } }))
  expect(result).toEqual({ text: `Image from ${PUBLIC_URL}`, images: [{ data: bytes, mimeType: "image/jpeg" }] })
})

test("a binary that isn't an image isn't returned as text", async () => {
  const result = await fetchFrom(
    new Response(new Uint8Array([0, 1, 2]), { headers: { "content-type": "application/octet-stream" } })
  )
  expect(result).toContain("is not a text page")
})

test("plain text comes back as is", async () => {
  const result = await fetchFrom(new Response("hello", { headers: { "content-type": "text/plain; charset=utf-8" } }))
  expect(result).toBe("hello")
})

const PROSE = "Budapest is the capital of Hungary, on both banks of the Danube. ".repeat(12)
const ARTICLE = `<html><head><title>Budapest</title></head><body>
  <nav><a href="/">Home</a><img src="/logo.png" alt="Logo"></nav>
  <article>
    <h1>Budapest</h1>
    <p>${PROSE}</p>
    <figure><img data-src="/big.jpg" src="/placeholder.gif"><figcaption>The Chain Bridge</figcaption></figure>
    <p>Read <a href="/history">its history</a> and <a href="#top">go up</a>.</p>
    <img srcset="/s.jpg 400w, /l.jpg 1600w" alt="Parliament">
    <img src="/pixel.gif" width="1" height="1" alt="">
    <img src="data:image/png;base64,AAAA" alt="inline">
    <img src="/icon.svg" alt="icon">
  </article>
  <footer>© someone</footer>
</body></html>`

test("a page is its article as Markdown, with no images or link URLs unless asked", () => {
  const markdown = pageMarkdown(ARTICLE, "https://example.com/city")
  expect(markdown).toStartWith("# Budapest")
  expect(markdown).toContain("Read its history and go up.")
  expect(markdown).not.toContain("](")
  expect(markdown).not.toMatch(/\n{3}/)
})

test("images: the article's real sources, absolute, with alt text from the caption; icons and inline data left out", () => {
  const markdown = pageMarkdown(ARTICLE, "https://example.com/city", { images: true })
  expect(markdown).toContain("![The Chain Bridge](https://example.com/big.jpg)")
  expect(markdown).toContain("![Parliament](https://example.com/l.jpg)")
  for (const gone of ["pixel.gif", "data:", "icon.svg", "logo.png"]) expect(markdown).not.toContain(gone)
})

test("links: absolute URLs; a fragment-only link stays text", () => {
  const markdown = pageMarkdown(ARTICLE, "https://example.com/city", { links: true })
  expect(markdown).toContain("[its history](https://example.com/history)")
  expect(markdown).toContain("and go up.")
})

const HOMEPAGE = `<html><head><title>News</title></head><body>
  <header><a href="/">News</a></header>
  <ul>
    <li><a href="/a"><img src="/a.jpg"><h2>First story</h2></a></li>
    <li><a href="/b"><img src="/b.jpg"><h2>Second story</h2></a></li>
  </ul>
  <footer>About</footer>
</body></html>`

test("a page without a real article (a homepage) is its whole body, less header and footer; cards' headings name their images", () => {
  const markdown = pageMarkdown(HOMEPAGE, "https://news.example/", { images: true })
  expect(markdown).toStartWith("# News")
  expect(markdown).toContain("![First story](https://news.example/a.jpg)")
  expect(markdown).toContain("Second story")
  expect(markdown).not.toContain("About")
})

test("whole_page reads the whole body even when there's an article", () => {
  const markdown = pageMarkdown(ARTICLE.replace("<footer>", "<p>Sidebar note</p><footer>"), "https://example.com/", {
    whole_page: true
  })
  expect(markdown).toContain("Sidebar note")
  expect(markdown).not.toContain("© someone")
})

test("a srcset's largest candidate wins, by width or density", () => {
  expect(largestInSrcset("a.jpg 400w, b.jpg 1600w, c.jpg 800w")).toBe("b.jpg")
  expect(largestInSrcset("a.jpg, b.jpg 2x")).toBe("b.jpg")
})
