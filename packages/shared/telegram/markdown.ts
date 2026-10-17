import { Marked, type Token, type Tokens } from "marked"

/** Renders assistant Markdown as Telegram HTML via a hand-rolled token walk on a fresh Marked instance — isolated from markdown.tsx's global ANSI renderer. */
const telegramMarked = new Marked()

/** Telegram's HTML parse mode only requires escaping these three characters. */
function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** Same three, plus the quote that would otherwise close an attribute early. */
function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll('"', "&quot;")
}

function renderInlineTokens(tokens: Token[] | undefined): string {
  if (!tokens) return ""
  return tokens.map(renderInlineToken).join("")
}

function renderInlineToken(token: Token): string {
  switch (token.type) {
    case "strong":
      return `<b>${renderInlineTokens((token as Tokens.Strong).tokens)}</b>`
    case "em":
      return `<i>${renderInlineTokens((token as Tokens.Em).tokens)}</i>`
    case "del":
      return `<s>${renderInlineTokens((token as Tokens.Del).tokens)}</s>`
    case "codespan":
      return `<code>${escapeHtml((token as Tokens.Codespan).text)}</code>`
    case "link": {
      const link = token as Tokens.Link
      return `<a href="${escapeAttr(link.href)}">${renderInlineTokens(link.tokens)}</a>`
    }
    case "image":
      // The picture itself follows the text as a photo (see telegramImages); the text keeps only its alt
      return escapeHtml((token as Tokens.Image).text)
    case "br":
      return "\n"
    case "escape":
      return escapeHtml((token as Tokens.Escape).text)
    case "text": {
      const text = token as Tokens.Text
      // Some inline text tokens (e.g. inside a single-line list item) carry their own nested tokens instead of plain .text — recurse into those when present, same fix components/elem/markdown.tsx applies for marked-terminal's renderer.
      return text.tokens ? renderInlineTokens(text.tokens) : escapeHtml(text.text)
    }
    default:
      return escapeHtml("text" in token ? (token.text as string) : token.raw)
  }
}

const BULLET = "• "

function listItemPrefix(item: Tokens.ListItem, ordered: boolean, n: number) {
  if (item.task) return item.checked ? "☑ " : "☐ "
  return ordered ? `${n}. ` : BULLET
}

function renderListItem(item: Tokens.ListItem, ordered: boolean, n: number): string {
  const prefix = listItemPrefix(item, ordered, n)
  const lines: string[] = []
  let inline = ""
  for (const t of item.tokens) {
    if (t.type === "list") {
      if (inline) {
        lines.push(prefix + inline)
        inline = ""
      }
      const nested = renderList(t as Tokens.List)
      lines.push(
        nested
          .split("\n")
          .map(l => `  ${l}`)
          .join("\n")
      )
    } else if (t.type === "text" || t.type === "paragraph") {
      const withTokens = t as Tokens.Text | Tokens.Paragraph
      inline += withTokens.tokens ? renderInlineTokens(withTokens.tokens) : escapeHtml(withTokens.text)
    } else {
      inline += renderInlineToken(t)
    }
  }
  if (inline || lines.length === 0) lines.unshift(prefix + inline)
  return lines.join("\n")
}

function renderList(token: Tokens.List): string {
  return token.items
    .map((item, i) => renderListItem(item, token.ordered, (token.ordered && token.start !== "" ? token.start : 1) + i))
    .join("\n")
}

function renderCode(token: Tokens.Code): string {
  const cls = token.lang ? ` class="language-${escapeAttr(token.lang.split(/\s/)[0]!)}"` : ""
  return `<pre><code${cls}>${escapeHtml(token.text)}</code></pre>`
}

function renderTable(token: Tokens.Table): string {
  const row = (cells: { text: string }[]) => cells.map(c => c.text).join(" | ")
  const lines = [row(token.header), ...token.rows.map(row)]
  return `<pre>${escapeHtml(lines.join("\n"))}</pre>`
}

function renderBlockToken(token: Token): string {
  switch (token.type) {
    case "heading":
      return `<b>${renderInlineTokens((token as Tokens.Heading).tokens)}</b>`
    case "paragraph":
      return renderInlineTokens((token as Tokens.Paragraph).tokens)
    case "list":
      return renderList(token as Tokens.List)
    case "blockquote":
      return `<blockquote>${(token as Tokens.Blockquote).tokens.map(renderBlockToken).join("\n")}</blockquote>`
    case "code":
      return renderCode(token as Tokens.Code)
    case "table":
      return renderTable(token as Tokens.Table)
    case "hr":
      return "———"
    case "space":
    case "def":
      return ""
    default:
      return escapeHtml("text" in token ? (token.text as string) : token.raw)
  }
}

/** Telegram's hard per-message character cap for text. */
export const TELEGRAM_MESSAGE_LIMIT = 4096

/** Telegram's cap for a photo's caption. */
export const TELEGRAM_CAPTION_LIMIT = 1024

/** A Markdown image in a reply, sent after its text as a photo: `src` as written (a URL or a local path), `alt` as its caption. */
export type TelegramImage = { src: string; alt: string }

/** The `![alt](src)` images in a reply, in order and once each; the same syntax inside code stays code. */
export function telegramImages(markdown: string): TelegramImage[] {
  if (!markdown.includes("![")) return []
  const images = new Map<string, TelegramImage>()
  telegramMarked.walkTokens(telegramMarked.lexer(markdown), token => {
    if (token.type === "image" && token.href && !images.has(token.href))
      images.set(token.href, { src: token.href, alt: token.text.slice(0, TELEGRAM_CAPTION_LIMIT) })
  })
  return [...images.values()]
}

export function renderTelegramHtml(markdown: string): string {
  const tokens = telegramMarked.lexer(markdown)
  return tokens
    .map(renderBlockToken)
    .filter(block => block.length > 0)
    .join("\n\n")
    .trim()
}

const TAG = /<(\/?)([a-z]+)\b[^>]*>/g

/** The tags still open at the end of `html`, outermost first. */
function openTags(html: string): { name: string; tag: string }[] {
  const open: { name: string; tag: string }[] = []
  for (const [tag, closing, name] of html.matchAll(TAG)) {
    const last = closing ? open.findLastIndex(t => t.name === name) : -1
    if (!closing) open.push({ name: name!, tag })
    else if (last >= 0) open.splice(last, 1)
  }
  return open
}

/** Moves a cut back so it lands outside any tag, entity or surrogate pair. */
function safeCut(html: string, at: number): number {
  const tagStart = html.lastIndexOf("<", at - 1)
  if (tagStart > html.lastIndexOf(">", at - 1)) at = tagStart
  // Every `&` in rendered HTML starts an entity
  const entityStart = html.lastIndexOf("&", at - 1)
  if (entityStart > html.lastIndexOf(";", at - 1)) at = entityStart
  const code = html.charCodeAt(at - 1)
  if (code >= 0xd800 && code <= 0xdbff) at--
  return at
}

/**
 * Cuts `html` into a head of at most `limit` characters, at a blank line, else a line break, else anywhere past
 * `from`; the tags open at the cut are closed at the head's end and reopened at the rest's start, so both parse.
 */
function cutHtml(html: string, limit: number, from: number): { head: string; rest: string; reopened: number } {
  let budget = limit
  for (;;) {
    const enough = from + (budget - from) / 2
    let at = html.lastIndexOf("\n\n", budget)
    if (at <= enough) at = html.lastIndexOf("\n", budget)
    if (at <= enough) at = budget
    at = safeCut(html, at)
    if (at <= from) at = budget
    const open = openTags(html.slice(0, at))
    const head =
      html.slice(0, at).replace(/\n+$/, "") +
      open
        .toReversed()
        .map(t => `</${t.name}>`)
        .join("")
    if (head.length <= limit || budget <= from + 1) {
      const reopen = open.map(t => t.tag).join("")
      // Only line breaks go: a code block's next line keeps its indentation
      return { head, rest: reopen + html.slice(at).replace(/^\n+/, ""), reopened: reopen.length }
    }
    budget -= head.length - limit
  }
}

/**
 * Splits already-rendered Telegram HTML into <=`limit`-char chunks for
 * separate sendMessage calls, breaking on a blank line where possible and
 * closing and reopening any tag a break falls inside (a long code block),
 * so every chunk parses. Used only at final/flush time — editMessageText
 * always targets one existing message, so it can't be split this way.
 */
export function splitTelegramMessage(html: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (html.length <= limit) return [html]
  const chunks: string[] = []
  let remaining = html
  let reopened = 0
  while (remaining.length > limit) {
    // A cut must get past the tags the chunk was reopened with, or it would make no progress
    const { head, rest, reopened: next } = cutHtml(remaining, limit, reopened)
    chunks.push(head)
    remaining = rest
    reopened = next
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

/**
 * Truncation for in-flight streaming edits that exceed the message limit:
 * cut like splitTelegramMessage (so the edit still parses), with an ellipsis.
 * Only ever transient — the next edit replaces it, and the final flush splits
 * the whole text over more messages.
 */
export function truncateForStreaming(html: string, limit = TELEGRAM_MESSAGE_LIMIT): string {
  if (html.length <= limit) return html
  const ellipsis = "\n…"
  return cutHtml(html, limit - ellipsis.length, 0).head + ellipsis
}
