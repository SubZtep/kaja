import { Box, Text, useWindowSize } from "ink"
import { Marked, marked, type Token } from "marked"
import { memo } from "react"
import { splitBlocks } from "../../lib/markdown/blocks"
import { dedent } from "../../lib/markdown/dedent"
import { markedTerminal } from "../../lib/markdown/marked-terminal"
import { type Palette, paint, usePalette } from "../theme"
import { TerminalImage } from "./terminal-image"

// cli-highlight's token colours from the palette, in the spirit of its default theme
function codeTheme(p: Palette) {
  return {
    keyword: paint(p.info),
    literal: paint(p.info),
    class: paint(p.info),
    built_in: paint(p.user),
    type: paint(p.user).dim,
    number: paint(p.success),
    comment: paint(p.success),
    doctag: paint(p.success),
    string: paint(p.danger),
    regexp: paint(p.danger),
    function: paint(p.warning),
    meta: paint(p.muted)
  }
}

/**
 * A markdown-to-ANSI parser in the palette's colours: the accent for structure (mirrors the agent's "●" prefix), the
 * user colour for emphasis/links (mirrors the user's "> " prefix), muted for de-emphasis.
 *
 * The source is rendered block by block ({@link splitBlocks}), each block cached on its own: a streaming message only
 * re-renders its last block, and a history item that remounts on scroll hits the cache. Keyed on the block's text —
 * marked-terminal wraps text at its own fixed width — plus the table width for a block that may hold a table, the one
 * thing sized to the terminal. Cleared wholesale past a cap to bound memory (streaming leaves throwaway prefixes of the
 * last block behind).
 */
function createParser(p: Palette) {
  let tableWidth = 80
  const renderer = new Marked(
    markedTerminal(
      {
        firstHeading: paint(p.accent).bold,
        heading: paint(p.accent).bold,
        strong: paint(p.user).bold,
        code: paint(p.code),
        codespan: paint(p.user),
        blockquote: paint(p.muted).italic,
        html: paint(p.muted),
        del: paint(p.muted).dim.strikethrough,
        link: paint(p.user),
        href: paint(p.user).underline,
        tableHead: paint(p.tableHead).bold,
        tableBorder: paint(p.tableBorder),
        tableWidth: () => tableWidth,
        tab: 2
      },
      { theme: codeTheme(p) }
    )
  )
  const rendered = new Map<string, string>()
  const renderBlock = (block: string) => {
    const key = block.includes("|") ? `${tableWidth}\0${block}` : block
    const hit = rendered.get(key)
    if (hit !== undefined) return hit
    const out = dedent(renderer.parse(block) as string)
    if (rendered.size > 2000) rendered.clear()
    rendered.set(key, out)
    return out
  }
  return (source: string, width: number) => {
    tableWidth = width
    return splitBlocks(source).map(renderBlock).join("\n\n")
  }
}

const parsers = new WeakMap<Palette, (source: string, tableWidth: number) => string>()

// Columns a table leaves free for what Markdown sits in: the agent's "●" and its gap, or the reasoning box's frame
const TABLE_MARGIN = 6

function useParser() {
  const palette = usePalette()
  const { columns } = useWindowSize()
  let parser = parsers.get(palette)
  if (!parser) {
    parser = createParser(palette)
    parsers.set(palette, parser)
  }
  const tableWidth = Math.max(20, columns - TABLE_MARGIN)
  return (source: string) => parser(source, tableWidth)
}

type Segment = { type: "text"; source: string } | { type: "image"; href: string; alt: string }

const segmentKey = (segment: Segment, i: number) => `${i}-${Bun.hash(JSON.stringify(segment)).toString(36)}`

type ImageAt = { start: number; end: number; href: string; alt: string }

// Finds each image token's offset by walking the tokens in order with a cursor, so the same `![alt](href)` shown
// earlier inside a code block or code span is stepped over instead of matched. Table cells are left alone: splitting
// a table around an image would break it.
function findImages(source: string, tokens: Token[], from: number, images: ImageAt[]) {
  let cursor = from
  for (const token of tokens) {
    const start = source.indexOf(token.raw, cursor)
    if (start === -1) continue
    if (token.type === "image") images.push({ start, end: start + token.raw.length, href: token.href, alt: token.text })
    else if (token.type === "list") findImages(source, token.items, start, images)
    else if (token.type !== "table" && "tokens" in token && token.tokens)
      findImages(source, token.tokens, start, images)
    cursor = start + token.raw.length
  }
}

/**
 * marked-terminal renders images as a link (`alt (href)`), the same as any
 * other link token — there's no terminal image protocol wired into the
 * renderer itself. To actually display images inline, the source is split
 * around each `![alt](href)` token ({@link findImages}) into text/image
 * segments; text segments still go through the normal marked-terminal
 * pipeline, images render via {@link TerminalImage}.
 */
export function splitSegments(source: string): Segment[] {
  // Lexing the whole text costs as much as rendering it; with no image syntax there's nothing to find
  if (!source.includes("![")) return [{ type: "text", source }]
  const images: ImageAt[] = []
  findImages(source, marked.lexer(source), 0, images)
  if (images.length === 0) return [{ type: "text", source }]

  const segments: Segment[] = []
  let cursor = 0
  for (const image of images) {
    const before = source.slice(cursor, image.start)
    if (before) segments.push({ type: "text", source: before })
    segments.push({ type: "image", href: image.href, alt: image.alt })
    cursor = image.end
  }
  const rest = source.slice(cursor)
  if (rest) segments.push({ type: "text", source: rest })
  return segments
}

// memo() so scroll ticks (which re-render mounted subtrees) skip items
// whose text is unchanged entirely.
export default memo(function Markdown({ children }: { children: string }) {
  const parseMarkdown = useParser()
  const segments = splitSegments(children)
  if (segments.length === 1 && segments[0]!.type === "text") return <Text>{parseMarkdown(children)}</Text>
  return (
    <Box flexDirection="column">
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <Text key={segmentKey(segment, i)}>{parseMarkdown(segment.source)}</Text>
        ) : (
          <TerminalImage key={segmentKey(segment, i)} href={segment.href} alt={segment.alt} />
        )
      )}
    </Box>
  )
})
