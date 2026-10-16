import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import TurndownService from "turndown"
import { z } from "zod"
import { ToolError, type ToolResult, tool } from "../../agent/agent"
import { fetchPublicHttp, UnsafeUrlError } from "../../security/ssrf"
import { getToolDeps } from "../deps"

/** Raised well above the ssrf default: heavy modern pages run past it, and the Markdown is a few KB before the model ever sees it. */
const MAX_PAGE_BYTES = 2 * 1024 * 1024
/** An image is brought into the conversation, where it's shrunk to model size; a big photo is still a few MB. */
const MAX_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024
/** An article shorter than this (a homepage's teaser block) isn't the page, so the whole body is used. */
const MIN_ARTICLE_CHARS = 500
/** Images listed per page; a gallery past this is only noise for the model. */
const MAX_PAGE_IMAGES = 30
/** An image declared this small or smaller is an icon or a tracking pixel. */
const MIN_IMAGE_EDGE = 32
/** Page parts that are never the content, removed before the whole body is converted. */
const CHROME_SELECTOR = "nav, header, footer, aside, form, [role=navigation], [role=banner], [role=contentinfo]"

const NAME = "fetch_url"

const schema = z.object({
  url: z.string().describe("The URL to fetch"),
  images: z
    .boolean()
    .optional()
    .describe("Set true to get the page's images as ![alt](url), e.g. to find or show a picture from it"),
  links: z
    .boolean()
    .optional()
    .describe("Set true when you need the page's link URLs to navigate further; otherwise links are plain text"),
  whole_page: z
    .boolean()
    .optional()
    .describe("Set true to read the whole page (a homepage, a list of articles) instead of just its main article")
})

type FetchArgs = z.infer<typeof schema>

/**
 * Fetches a URL: a page comes back as Markdown, an image is brought into the conversation (stored and shown).
 *
 * @param args.url - The URL to fetch.
 * @param args.images - Keep the page's images, as `![alt](absolute url)`.
 * @param args.links - Keep the page's links, as `[text](absolute url)`.
 * @param args.whole_page - Convert the whole `<body>` (less nav, header, footer) instead of Readability's article.
 */
export const fetchUrlTool = tool({
  name: NAME,
  description:
    "Fetch a specific, known URL. Use this instead of web_search when you already have the exact URL (e.g. the " +
    "user gave you a link, or a prior search result) — it's cheaper and returns the actual page. A web page comes " +
    "back as Markdown: its main article, or the whole page when it has none (a homepage). An image URL brings the " +
    "image into the conversation and shows it to the user. The full page is returned unsummarized — if it's long, " +
    "call summarize on the result before replying instead of condensing it yourself.",
  schema,
  execute: async (args): Promise<string | ToolResult> => {
    let res: Response
    try {
      res = await fetchPublicHttp(args.url, { maxBytes: MAX_IMAGE_SOURCE_BYTES, send: getToolDeps().fetchSend })
    } catch (error) {
      if (error instanceof UnsafeUrlError) throw new ToolError(NAME, error.message)
      throw new ToolError(NAME, error instanceof Error ? error.message : String(error))
    }
    if (!res.ok) throw new ToolError(NAME, `Fetch failed: ${res.status} ${args.url}`)
    const contentType = res.headers.get("content-type") ?? ""
    if (contentType.startsWith("image/")) {
      const data = new Uint8Array(await res.arrayBuffer())
      return { text: `Image from ${args.url}`, images: [{ data, mimeType: contentType.split(";")[0]! }] }
    }
    if (!isTextual(contentType)) {
      await res.body?.cancel()
      return `${args.url} is not a text page (${contentType.split(";")[0]}), so there is nothing to read.`
    }
    const body = await res.text()
    if (body.length > MAX_PAGE_BYTES) throw new ToolError(NAME, `Response too large (>${MAX_PAGE_BYTES} bytes)`)
    return contentType.includes("html") ? pageMarkdown(body, res.url || args.url, args) : body
  }
})

// A missing content type is read as text; anything else must name a text format
function isTextual(contentType: string): boolean {
  if (!contentType) return true
  return /(?:^text\/)|json|xml|javascript|ecmascript|csv|yaml|toml|markdown/i.test(contentType)
}

/** A page as Markdown: Readability's article, or the whole body when there's no real article (or it's asked for). */
export function pageMarkdown(html: string, url: string, opts: Omit<FetchArgs, "url"> = {}): string {
  const base = baseUrl(html, url)
  if (!opts.whole_page) {
    const { document } = parseHTML(html)
    prepareDocument(document, base)
    const article = new Readability(document).parse()
    if (article?.content && (article.textContent?.trim().length ?? 0) >= MIN_ARTICLE_CHARS) {
      return tidy(withTitle(article.title, toMarkdown(article.content, opts)))
    }
  }
  // Readability changes the document it reads, so the body comes from a fresh parse
  const { document } = parseHTML(html)
  prepareDocument(document, base)
  for (const node of document.querySelectorAll(CHROME_SELECTOR)) node.remove()
  const title = document.querySelector("title")?.textContent
  return tidy(withTitle(title, toMarkdown(document.body?.innerHTML ?? "", opts)))
}

function withTitle(title: string | null | undefined, markdown: string): string {
  const heading = title?.trim()
  return heading ? `# ${heading}\n\n${markdown}` : markdown
}

// The page's own <base href>, else where it was fetched from
function baseUrl(html: string, url: string): string {
  const href = /<base\s[^>]*href=["']([^"']+)["']/i.exec(html)?.[1]
  return href ? (absolute(href, url) ?? url) : url
}

function absolute(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).href
  } catch {
    return undefined
  }
}

/**
 * Makes links and images absolute, and gives each image its real source (lazy-load attributes, a srcset's largest)
 * and an alt (title, the figure's caption, then the heading of the card it's in); icons, tracking pixels, SVGs and inline data are dropped.
 */
function prepareDocument(document: Document, base: string) {
  for (const node of document.querySelectorAll("script, style, noscript, template, svg, iframe")) node.remove()
  for (const link of document.querySelectorAll("a[href]")) {
    const raw = link.getAttribute("href")!
    const href = absolute(raw, base)
    // An in-page anchor or a javascript: link goes nowhere the model could fetch
    if (!raw.startsWith("#") && href?.startsWith("http")) link.setAttribute("href", href)
    else link.removeAttribute("href")
  }
  for (const picture of document.querySelectorAll("picture")) {
    const img = picture.querySelector("img")
    const srcset = [...picture.querySelectorAll<HTMLElement>("source[srcset], source[data-srcset]")]
      .map(source => source.getAttribute("srcset") ?? source.dataset.srcset)
      .find(Boolean)
    if (img && srcset && !img.getAttribute("srcset")) img.setAttribute("srcset", srcset)
  }
  for (const img of document.querySelectorAll("img")) {
    const src = imageSource(img, base)
    if (!src || isTiny(img)) {
      img.remove()
      continue
    }
    img.setAttribute("src", src)
    for (const attr of ["srcset", "data-src", "data-srcset", "data-lazy-src", "data-original", "loading"])
      img.removeAttribute(attr)
    const caption = img.closest("figure")?.querySelector("figcaption")?.textContent?.trim()
    const alt =
      img.getAttribute("alt")?.trim() || img.getAttribute("title")?.trim() || caption || nearHeading(img) || ""
    img.setAttribute("alt", alt.replace(/\s+/g, " "))
  }
}

// A teaser card's heading, for an image with no alt of its own (a homepage's article list)
function nearHeading(img: Element): string | undefined {
  const card = img.closest("article, li, a")
  return card?.querySelector("h1, h2, h3, h4")?.textContent?.trim() || undefined
}

// The image's real source: a lazy-load attribute, a srcset's largest, then src; never an SVG or inline data
function imageSource(img: HTMLElement, base: string): string | undefined {
  const lazy = img.dataset.src || img.dataset.lazySrc || img.dataset.original
  const srcset = img.getAttribute("srcset") ?? img.dataset.srcset
  const candidate = lazy ?? (srcset ? largestInSrcset(srcset) : undefined) ?? img.getAttribute("src")
  if (!candidate || candidate.startsWith("data:")) return undefined
  const src = absolute(candidate, base)
  if (!src?.startsWith("http") || /\.svg(?:$|[?#])/i.test(src)) return undefined
  return src
}

/** The biggest candidate in a srcset (`a.jpg 400w, b.jpg 800w` or `a.jpg 1x, b.jpg 2x`). */
export function largestInSrcset(srcset: string): string | undefined {
  let best: { url: string; size: number } | undefined
  for (const part of srcset.split(/,\s+/)) {
    const [url, descriptor = "1x"] = part.trim().split(/\s+/)
    if (!url) continue
    const size = Number.parseFloat(descriptor) || 1
    if (!best || size > best.size) best = { url, size }
  }
  return best?.url
}

// Declared tiny (an icon, a tracking pixel); an image with no size attributes is kept
function isTiny(img: Element): boolean {
  const edge = (attr: string) => Number.parseInt(img.getAttribute(attr) ?? "", 10)
  return [edge("width"), edge("height")].some(size => size > 0 && size <= MIN_IMAGE_EDGE)
}

function toMarkdown(html: string, opts: Omit<FetchArgs, "url">): string {
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" })
  let images = 0
  turndown.addRule("images", {
    filter: "img",
    replacement: (_content, node) => {
      const img = node as HTMLImageElement
      const src = img.getAttribute("src")
      if (!opts.images || !src || images >= MAX_PAGE_IMAGES) return ""
      images++
      return `![${(img.getAttribute("alt") ?? "").replace(/[[\]]/g, "")}](${src})`
    }
  })
  turndown.addRule("links", {
    filter: "a",
    replacement: (content, node) => {
      const href = (node as HTMLAnchorElement).getAttribute("href")
      const text = content.trim()
      if (!opts.links || !href || !text) return content
      return `[${text}](${href})`
    }
  })
  return turndown.turndown(html)
}

// Blank lines and stray spaces from the page's own indentation, collapsed
function tidy(markdown: string): string {
  return markdown
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
