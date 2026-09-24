// A fence opener or closer: up to three spaces, then three or more backticks or tildes
const FENCE = /^ {0,3}(`{3,}|~{3,})/

// A reference-style link definition, `[label]: url`, which may be used from any other block
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:\s/m

// A list item's first line: a bullet, or a number with "." or ")"
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)])(\s|$)/

// The first non-blank line from `from` on, if any
function nextContentLine(lines: string[], from: number): string | undefined {
  for (let j = from; j < lines.length; j++) {
    if (lines[j]!.trim() !== "") return lines[j]
  }
  return undefined
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const marker = FENCE.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
    } else if (marker) {
      fence = marker
    }

    if (!fence && line.trim() !== "" && !/^\s/.test(line)) inList = LIST_ITEM.test(line)

    const next = !fence && line.trim() === "" ? nextContentLine(lines, i + 1) : undefined
    // Not before an indented line (a list item's continuation, an indented code block), nor the next item of this list
    if (next !== undefined && !/^\s/.test(next) && !(inList && LIST_ITEM.test(next))) {
      if (current.some(l => l.trim() !== "")) blocks.push(current.join("\n").trimEnd())
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.some(l => l.trim() !== "")) blocks.push(current.join("\n").trimEnd())
  return blocks
}
