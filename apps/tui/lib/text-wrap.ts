export type VisualLine = {
  /** Inclusive start offset into the original string. */
  start: number
  /** Exclusive end offset into the original string. */
  end: number
  text: string
}

/**
 * Soft-wrap `text` to `width` terminal columns (emoji-aware via Bun.stringWidth).
 * Breaks at spaces so words stay whole; a word wider than the line is split by column.
 * Spaces at a soft break are left out of both lines, so no line starts with one.
 * Hard newlines (`\n`) always break. Empty string yields a single empty line
 * so the cursor has a row to sit on.
 */
export function softWrapLines(text: string, width: number): VisualLine[] {
  const w = Math.max(1, Math.floor(width))
  if (text.length === 0) {
    return [{ start: 0, end: 0, text: "" }]
  }

  const state: WrapState = { lines: [], lineStart: 0, text: "", width: 0, soft: false, breakText: 0, breakOffset: 0 }
  let i = 0
  for (const char of text) {
    placeChar(state, char, i, w)
    i += char.length
  }
  state.lines.push({ start: state.lineStart, end: i, text: state.text })
  return state.lines
}

/** The line being built, plus the lines finished so far. */
type WrapState = {
  lines: VisualLine[]
  lineStart: number
  text: string
  width: number
  // The line began at a soft wrap (not the text start or after `\n`), so its leading spaces are dropped.
  soft: boolean
  // Last place a word ended on this line: text length before the space run, and its string offset.
  breakText: number
  breakOffset: number
}

/** Finishes the current line at `end` and starts the next at `nextStart`. */
function endLine(s: WrapState, end: number, nextStart: number, soft: boolean) {
  s.lines.push({ start: s.lineStart, end, text: s.text })
  s.lineStart = nextStart
  s.text = ""
  s.width = 0
  s.soft = soft
  s.breakText = 0
}

/** A word overflows the line: carry it to the next line minus the spaces before it, or, with no break point, split by column at `i`. */
function breakLine(s: WrapState, i: number) {
  if (s.breakText === 0) {
    endLine(s, i, i, true)
    return
  }
  const rest = s.text.slice(s.breakText)
  const word = rest.trimStart()
  s.lines.push({ start: s.lineStart, end: s.breakOffset, text: s.text.slice(0, s.breakText) })
  s.lineStart = s.breakOffset + (rest.length - word.length)
  s.text = word
  s.width = Bun.stringWidth(word)
  s.breakText = 0
  s.soft = true
}

function placeChar(s: WrapState, char: string, i: number, w: number) {
  if (char === "\n") {
    // end is exclusive and includes the newline so the cursor after `\n` lands on the following visual line.
    endLine(s, i + 1, i + 1, false)
    return
  }
  if (char === " " && s.text.length === 0 && s.soft) {
    s.lineStart = i + 1
    return
  }
  const cw = Math.max(1, Bun.stringWidth(char))
  if (char === " " && s.width + cw > w && s.text.length > 0) {
    // A space at the wrap point ends the line and is dropped.
    endLine(s, i, i + 1, true)
    return
  }
  while (char !== " " && s.width + cw > w && s.text.length > 0) breakLine(s, i)
  if (char === " " && s.text.length > 0 && !s.text.endsWith(" ")) {
    s.breakText = s.text.length
    s.breakOffset = i
  }
  s.text += char
  s.width += cw
}

/** Visual line index that contains the cursor (cursor may be at end of string). */
export function cursorLineIndex(lines: VisualLine[], cursorOffset: number): number {
  if (lines.length === 0) return 0
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!
    const last = li === lines.length - 1
    if (cursorOffset < line.end || (last && cursorOffset <= line.end)) {
      // Cursor at soft-wrap boundary sits on the next line (except true EOL).
      if (!last && cursorOffset === line.end) continue
      return li
    }
  }
  return lines.length - 1
}

/**
 * Keep `cursorLine` inside the visible window `[windowStart, windowStart + maxVisible)`.
 */
export function clampWindowStart(
  cursorLine: number,
  windowStart: number,
  maxVisible: number,
  totalLines: number
): number {
  const maxVis = Math.max(1, maxVisible)
  const maxStart = Math.max(0, totalLines - maxVis)
  let start = Math.min(Math.max(0, windowStart), maxStart)
  if (cursorLine < start) start = cursorLine
  if (cursorLine >= start + maxVis) start = cursorLine - maxVis + 1
  return Math.min(Math.max(0, start), maxStart)
}

/** Huge width ⇒ soft-wrap never fires; only hard `\n` breaks. */
const HARD_LINES_ONLY = 1_000_000

export function layoutLines(text: string, width?: number): VisualLine[] {
  return softWrapLines(text, width && width > 0 ? width : HARD_LINES_ONLY)
}

/**
 * Display-width column of `cursorOffset` within its visual line
 * (emoji-aware via Bun.stringWidth).
 */
export function displayColumnAt(lines: VisualLine[], cursorOffset: number): number {
  if (lines.length === 0) return 0
  const line = lines[cursorLineIndex(lines, cursorOffset)]!
  const within = Math.max(0, Math.min(cursorOffset, line.start + line.text.length) - line.start)
  return Bun.stringWidth(line.text.slice(0, within))
}

/**
 * Map a preferred display column onto a visual line (clamped to the line end).
 */
export function offsetAtDisplayColumn(line: VisualLine, preferredCol: number): number {
  if (preferredCol <= 0 || line.text.length === 0) return line.start
  let col = 0
  let i = 0
  for (const char of line.text) {
    const cw = Math.max(1, Bun.stringWidth(char))
    if (col + cw > preferredCol) break
    col += cw
    i += char.length
    if (col === preferredCol) break
  }
  return line.start + i
}

/** Start of the visual line containing `cursorOffset`. */
export function lineStartOffset(value: string, cursorOffset: number, width?: number): number {
  const lines = layoutLines(value, width)
  return lines[cursorLineIndex(lines, cursorOffset)]!.start
}

/**
 * End of content on the visual line containing `cursorOffset`
 * (before a trailing hard newline, if any).
 */
export function lineEndOffset(value: string, cursorOffset: number, width?: number): number {
  const lines = layoutLines(value, width)
  const line = lines[cursorLineIndex(lines, cursorOffset)]!
  return line.start + line.text.length
}

/**
 * Move the cursor one visual line up (`-1`) or down (`+1`).
 * Sticky `preferredColumn` is re-seeded from the current position when null.
 * At the first/last line the offset is unchanged but preferred column is still set.
 */
export function moveVertical(
  value: string,
  cursorOffset: number,
  dir: -1 | 1,
  width?: number,
  preferredColumn: number | null = null
): { cursorOffset: number; preferredColumn: number } {
  const lines = layoutLines(value, width)
  const li = cursorLineIndex(lines, cursorOffset)
  const col = preferredColumn ?? displayColumnAt(lines, cursorOffset)
  const target = li + dir
  if (target < 0 || target >= lines.length) {
    return { cursorOffset, preferredColumn: col }
  }
  return {
    cursorOffset: offsetAtDisplayColumn(lines[target]!, col),
    preferredColumn: col
  }
}
