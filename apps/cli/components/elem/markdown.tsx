import chalk from "chalk"
import dedent from "dedent"
import { Box, Text } from "ink"
import Image from "ink-picture"
import { type MarkedExtension, marked } from "marked"
import { markedTerminal } from "marked-terminal"
import { memo } from "react"

// Palette matches the app's own chat colors (timeline.tsx): pink for structure (mirrors the agent's "●" prefix), cyan for emphasis/code/links (mirrors the user's "> " prefix), gray for de-emphasis.
// @types/marked-terminal lags the v7 runtime API, which returns a MarkedExtension
marked.use(
  markedTerminal({
    firstHeading: chalk.hex("#ff1493").bold,
    heading: chalk.hex("#ff1493").bold,
    strong: chalk.cyanBright.bold,
    codespan: chalk.cyanBright,
    blockquote: chalk.gray.italic,
    link: chalk.cyanBright,
    href: chalk.cyanBright.underline,
    tableOptions: {
      style: { head: ["magenta"], border: ["gray"] }
    },
    tab: 2
  }) as unknown as MarkedExtension
)

// marked-terminal's own "text" renderer reads token.text (the raw, unparsed source) instead of recursing into token.tokens, so inline markdown - links, bold, ... - inside a single-line list item or table cell renders as literal source instead of being parsed. Its own link/del/heading renderers don't have this bug; this patches text() to match them.
marked.use({
  renderer: {
    text(token: any) {
      if (token.tokens) return this.parser!.parseInline(token.tokens)
      return token.text
    }
  }
} as MarkedExtension)

/**
 * Module-level parse cache: parsing is by far the most expensive per-item
 * work, and the same string is parsed again whenever a history item
 * remounts (scrolling brings it back into the virtualized window). Keyed
 * on the source string only — marked-terminal wraps at its own fixed
 * width, so output doesn't depend on the terminal size. Cleared wholesale
 * past a cap to bound memory (streaming partials insert throwaway
 * prefixes).
 */
const parsed = new Map<string, string>()

function parseMarkdown(source: string) {
  const hit = parsed.get(source)
  if (hit !== undefined) return hit
  const out = dedent(marked.parse(source) as string)
  if (parsed.size > 500) parsed.clear()
  parsed.set(source, out)
  return out
}

type Segment = { type: "text"; source: string } | { type: "image"; href: string; alt: string }

const segmentKey = (segment: Segment, i: number) => `${i}-${Bun.hash(JSON.stringify(segment)).toString(36)}`

/**
 * marked-terminal renders images as a link (`alt (href)`), the same as any
 * other link token — there's no terminal image protocol wired into the
 * renderer itself. To actually display images inline, the source is split
 * around each `![alt](href)` occurrence (found via `marked.lexer` +
 * `walkTokens`, in document order) into text/image segments; text segments
 * still go through the normal marked-terminal pipeline, images render via
 * `ink-picture`'s `<Image>`.
 */
function splitSegments(source: string): Segment[] {
  const images: { raw: string; href: string; alt: string }[] = []
  marked.walkTokens(marked.lexer(source), token => {
    if (token.type === "image") images.push({ raw: token.raw, href: token.href, alt: token.text })
  })
  if (images.length === 0) return [{ type: "text", source }]

  const segments: Segment[] = []
  let rest = source
  for (const image of images) {
    const index = rest.indexOf(image.raw)
    if (index === -1) continue
    const before = rest.slice(0, index)
    if (before) segments.push({ type: "text", source: before })
    segments.push({ type: "image", href: image.href, alt: image.alt })
    rest = rest.slice(index + image.raw.length)
  }
  if (rest) segments.push({ type: "text", source: rest })
  return segments
}

// memo() so scroll ticks (which re-render mounted subtrees) skip items
// whose text is unchanged entirely.
export default memo(function Markdown({ children }: { children: string }) {
  const segments = splitSegments(children)
  if (segments.length === 1 && segments[0]!.type === "text") return <Text>{parseMarkdown(children)}</Text>
  return (
    <Box flexDirection="column">
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <Text key={segmentKey(segment, i)}>{parseMarkdown(segment.source)}</Text>
        ) : (
          <Box key={segmentKey(segment, i)} flexDirection="column">
            <Image src={segment.href} width={10} height={5} alt={segment.alt} />
            {segment.alt && <Text dimColor>{segment.alt}</Text>}
          </Box>
        )
      )}
    </Box>
  )
})
