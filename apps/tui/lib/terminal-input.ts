/**
 * Terminal input helpers. Ink 8 drops complete control sequences it has no key for (mouse, focus, colour-scheme and
 * other terminal replies) before useInput, so the reports the chat asks for are read off stdin by useTerminalReports
 * and decoded here; the text field only filters what still gets through as text.
 */

const ESC = "\u001b"

function stripEsc(input: string): string {
  return input.startsWith(ESC) ? input.slice(1) : input
}

// X10 mouse (`ESC[M` + 3 bytes) or a CSI sequence (`ESC[`, optional private marker, params, final byte)
const REPORT = new RegExp(String.raw`${ESC}\[(?:M[\s\S]{3}|[<>?]?[\d;:]*[@-~])`, "g")

/** The escape sequences in a raw stdin chunk, ESC included, in order; text between them is skipped. */
export function splitTerminalReports(chunk: string): string[] {
  return Array.from(chunk.matchAll(REPORT), match => match[0])
}

/**
 * Some terminals/multiplexers mangle escape-sequence replies into their
 * decimal byte values instead of raw bytes, e.g. `27,91,63,48,117` for
 * `\x1b[?0u`. Any comma-separated byte list starting with 27 (ESC) is noise,
 * not something a human typed.
 */
function isEscapeByteList(input: string): boolean {
  if (!input) return false
  const parts = input.split(",")
  if (parts.length < 2) return false
  if (!/^\d+$/.test(parts[0]!) || Number(parts[0]) !== 27) return false
  return parts.every(p => /^\d+$/.test(p) && Number(p) <= 255)
}

/**
 * xterm focus-reporting event (DECSET 1004): `[I` on window focus-in, `[O` on
 * focus-out. Sent unprompted whenever the terminal window's OS focus changes,
 * once `FOCUS_REPORTING_ENABLE` has been written.
 */
export function windowFocusReport(input: string): "in" | "out" | null {
  const s = stripEsc(input)
  if (s === "[I") return "in"
  if (s === "[O") return "out"
  return null
}

/**
 * Colour-scheme report (DECSET 2031): `[?997;1n` when the terminal turns dark, `[?997;2n` when it turns light. Sent
 * unprompted on every change once `COLOR_SCHEME_REPORTING_ENABLE` has been written (kitty, Ghostty, Contour, …).
 */
export function colorSchemeReport(input: string): "dark" | "light" | null {
  const s = stripEsc(input)
  if (s === "[?997;1n") return "dark"
  if (s === "[?997;2n") return "light"
  return null
}

/** Terminal noise that still reaches useInput as text and must not be typed into the input. */
export function isIgnoredTerminalInput(input: string): boolean {
  return isEscapeByteList(input)
}

export type MouseEvent = { kind: "press" | "move"; col: number; row: number }

/** Decodes an SGR left-button press or a button-less move, with the 0-based cell it happened in; null for anything else (wheel, release, drag, other buttons). */
export function parseMouse(input: string): MouseEvent | null {
  const sgr = /^\[<(\d+);(\d+);(\d+)([Mm])$/.exec(stripEsc(input))
  if (!sgr) return null
  const button = Number(sgr[1])
  const col = Number(sgr[2]) - 1
  const row = Number(sgr[3]) - 1
  if (sgr[4] === "M" && button === 0) return { kind: "press", col, row }
  if (button === 35) return { kind: "move", col, row }
  return null
}

export type WheelDirection = "up" | "down"

/**
 * Decode a wheel tick from a mouse sequence. Returns null for clicks / unknown.
 * SGR wheel: button 64 = up, 65 = down (optionally + shift/meta bits).
 */
export function parseWheelDirection(input: string): WheelDirection | null {
  const s = stripEsc(input)
  const sgr = /^\[<(\d+);\d+;\d+[Mm]$/.exec(s)
  if (sgr) {
    const btn = Number(sgr[1])
    // 64/65 base; low bits may carry modifiers on some terminals
    const base = btn & ~0x1c
    if (base === 64 || btn === 64 || btn === 68) return "up"
    if (base === 65 || btn === 65 || btn === 69) return "down"
    return null
  }
  // X10: button byte is first of the three chars after M, encoded as value+32
  const x10 = /^\[M(.)..$/.exec(s)
  if (x10) {
    const btn = (x10[1]!.codePointAt(0)! - 32) & 0x7f
    if (btn === 64) return "up"
    if (btn === 65) return "down"
  }
  return null
}

/** CSI sequences to enable SGR mouse + wheel (and alternate-scroll on altscreen). */
export const MOUSE_ENABLE =
  `${ESC}[?1000h` + // mouse click/drag
  `${ESC}[?1003h` + // motion with no button held, for hover
  `${ESC}[?1006h` + // SGR encoding
  `${ESC}[?1007h` // alternate scroll (wheel → app on alternate screen)

export const MOUSE_DISABLE = `${ESC}[?1007l` + `${ESC}[?1006l` + `${ESC}[?1003l` + `${ESC}[?1000l`

/** DECSET 1004: ask the terminal to report window focus in/out events (see {@link windowFocusReport}). */
export const FOCUS_REPORTING_ENABLE = `${ESC}[?1004h`
export const FOCUS_REPORTING_DISABLE = `${ESC}[?1004l`

/** DECSET 2031: ask the terminal to report colour-scheme changes (see {@link colorSchemeReport}). */
export const COLOR_SCHEME_REPORTING_ENABLE = `${ESC}[?2031h`
export const COLOR_SCHEME_REPORTING_DISABLE = `${ESC}[?2031l`
