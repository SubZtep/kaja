/** A GFM column alignment, as marked reports it (`null` when the delimiter row has no colon). */
export type Align = "left" | "right" | "center" | null

type Style = (text: string) => string

/** What {@link renderTable} draws: already styled cell text, and how to paint the header and the frame. */
export type TableInput = {
  head: string[]
  rows: string[][]
  align: Align[]
  /** The most columns the table may take, frame included; wider content wraps inside its cell. */
  maxWidth: number
  headStyle: Style
  borderStyle: Style
}

// Each column costs "│ " before and " " after its content, plus the final "│"
const frameWidth = (columns: number) => columns * 3 + 1

// The narrowest a column is squeezed to, unless its content is narrower still
const MIN_COLUMN = 6

/**
 * Column widths that fit `room` content columns: the natural widths when they fit, else the widest columns are capped
 * at one shared limit (water-filling), so short columns keep their full width and only long text wraps.
 */
function fitWidths(natural: number[], room: number): number[] {
  if (natural.reduce((a, b) => a + b, 0) <= room) return natural
  const floors = natural.map(w => Math.min(w, MIN_COLUMN))
  let cap = Math.max(...natural)
  while (cap > MIN_COLUMN && natural.reduce((sum, w, i) => sum + Math.max(floors[i]!, Math.min(w, cap)), 0) > room) {
    cap--
  }
  return natural.map((w, i) => Math.max(floors[i]!, Math.min(w, cap)))
}

function pad(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - Bun.stringWidth(text))
  if (align === "right") return " ".repeat(gap) + text
  if (align === "center") return " ".repeat(Math.floor(gap / 2)) + text + " ".repeat(Math.ceil(gap / 2))
  return text + " ".repeat(gap)
}

/**
 * Draws a markdown table in rounded box characters, with a rule under the header, and between body rows only when a
 * row wraps; the header is left out when all its cells are empty. Columns follow the table's alignment and wrap to fit
 * `maxWidth`.
 */
export function renderTable({ head, rows, align, maxWidth, headStyle, borderStyle }: TableInput): string {
  const columns = Math.max(head.length, ...rows.map(r => r.length))
  const cell = (row: string[], i: number) => (row[i] ?? "").trim()
  const showHead = head.some(h => h.trim() !== "")
  const all = showHead ? [head, ...rows] : rows

  const natural = Array.from({ length: columns }, (_, i) =>
    Math.max(1, ...all.map(row => Bun.stringWidth(cell(row, i))))
  )
  const widths = fitWidths(natural, Math.max(columns, maxWidth - frameWidth(columns)))

  const rule = (left: string, mid: string, right: string) =>
    borderStyle(left + widths.map(w => "─".repeat(w + 2)).join(mid) + right)
  const bar = borderStyle("│")

  const line = (row: string[], style: Style = s => s) => {
    const wrapped = widths.map((w, i) => Bun.wrapAnsi(cell(row, i), w, { hard: true, trim: true }).split("\n"))
    const height = Math.max(...wrapped.map(lines => lines.length))
    return Array.from({ length: height }, (_, l) => {
      const parts = widths.map((w, i) => ` ${style(pad(wrapped[i]![l] ?? "", w, align[i] ?? null))} `)
      return bar + parts.join(bar) + bar
    }).join("\n")
  }

  const body = rows.map(row => line(row))
  // A rule between body rows only once a row wraps, where it's needed to tell the rows apart
  const joiner = body.some(row => row.includes("\n")) ? `\n${rule("├", "┼", "┤")}\n` : "\n"
  const out = [rule("╭", "┬", "╮")]
  if (showHead) out.push(line(head, headStyle), rule("├", "┼", "┤"))
  if (body.length > 0) out.push(body.join(joiner))
  out.push(rule("╰", "┴", "╯"))
  return out.join("\n")
}
