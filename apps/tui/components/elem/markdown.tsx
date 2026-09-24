import { Box, Text } from "ink"
import { Marked, marked } from "marked"
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
 * re-renders its last block, and a history item that remounts on scroll hits the cache. Keyed on the block's text only
 * — marked-terminal wraps at its own fixed width, so output doesn't depend on the terminal size. Cleared wholesale past
 * a cap to bound memory (streaming leaves throwaway prefixes of the last block behind).
 */
function createParser(p: Palette) {
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
        tableOptions: {
          style: { head: [p.tableHead], border: [p.tableBorder] }
        },
        tab: 2
      },
      { theme: codeTheme(p) }
    )
  )
  const rendered = new Map<string, string>()
  const renderBlock = (block: string) => {
    const hit = rendered.get(block)
    if (hit !== undefined) return hit
    const out = dedent(renderer.parse(block) as string)
    if (rendered.size > 2000) rendered.clear()
    rendered.set(block, out)
    return out
  }
  return (source: string) => splitBlocks(source).map(renderBlock).join("\n\n")
}

const parsers = new WeakMap<Palette, (source: string) => string>()

function useParser() {
  const palette = usePalette()
  let parser = parsers.get(palette)
  if (!parser) {
    parser = createParser(palette)
    parsers.set(palette, parser)
  }
  return parser
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
 * {@link TerminalImage}.
 */
function splitSegments(source: string): Segment[] {
  // Lexing the whole text costs as much as rendering it; with no image syntax there's nothing to find
  if (!source.includes("![")) return [{ type: "text", source }]
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
