// A fence opener or closer: up to three spaces, then three or more backticks or tildes
const FENCE = /^ {0,3}(`{3,}|~{3,})/

// A reference-style link definition, `[label]: url`, which may be used from any other block
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s/m

// A list item's first line: a bullet, or a number with "." or ")"
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)])(\s|$)/

const isBlank = (line: string) => line.trim() === ""
const isIndented = (line: string) => /^\s/.test(line)

// The first non-blank line from `from` on, if any
function nextContentLine(lines: string[], from: number): string | undefined {
  return lines.slice(from).find(line => !isBlank(line))
}

// The fence open after `line`: a marker opens one, and only a marker of the same character, at least as long, closes it
function fenceAfter(fence: string | undefined, line: string): string | undefined {
  const marker = FENCE.exec(line)?.[1]
  if (!fence) return marker
  return marker?.startsWith(fence[0]!) && marker.length >= fence.length ? undefined : fence
}

// Whether the blank line at `i` ends a block: not before an indented line (a list item's continuation, an indented code block), nor the next item of this list
function breaksAt(lines: string[], i: number, inList: boolean): boolean {
  const next = nextContentLine(lines, i + 1)
  return next !== undefined && !isIndented(next) && !(inList && LIST_ITEM.test(next))
}

/**
 * Splits markdown into top-level blocks at blank lines, so each one can be rendered and cached on its own: while a
 * message streams, only its last block changes. Never splits inside a code fence, before an indented line, or between
 * two items of one list, where the pieces only mean something together. Text with reference-style link definitions
 * stays whole, since a definition applies across blocks.
 */
export function splitBlocks(source: string): string[] {
  if (LINK_DEFINITION.test(source)) return [source]

  const lines = source.split("\n")
  const blocks: string[] = []
  let current: string[] = []
  let fence: string | undefined
  // Inside a list, a blank line between two items doesn't end it
  let inList = false

  const flush = () => {
    if (current.some(line => !isBlank(line))) blocks.push(current.join("\n").trimEnd())
    current = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    fence = fenceAfter(fence, line)
    if (!fence && isBlank(line) && breaksAt(lines, i, inList)) {
      flush()
      continue
    }
    if (!fence && !isBlank(line) && !isIndented(line)) inList = LIST_ITEM.test(line)
    current.push(line)
  }
  flush()
  return blocks
}
