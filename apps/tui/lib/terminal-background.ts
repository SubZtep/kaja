import type { KajaPreferences } from "@kaja/schema/config"

/** Whether the terminal's background is dark or light. */
export type Brightness = "dark" | "light"

/** A resolved theme: `auto` has been turned into dark or light before the UI renders; `terminal` paints with the terminal's own scheme. */
export type ThemeName = Brightness | "terminal"

/** The terminal's colour scheme as `#rrggbb`: what it answered for its foreground, background and ANSI colours 0–15 (an unanswered one is missing). */
export type TerminalColours = { foreground?: string; background?: string; ansi: (string | undefined)[] }

// OSC 10/11 ask for the foreground and background colour, OSC 4 for each of the 16 ANSI colours; DA1 (CSI c) is
// answered by practically every terminal, and replies come in order, so seeing the DA1 reply means an unanswered OSC
// is unsupported — no need to sit out the timeout
const ESC = "\u001b"
const ST = `${ESC}\\`
const ANSI_QUERIES = Array.from({ length: 16 }, (_, index) => `${ESC}]4;${index};?${ST}`).join("")
const QUERY = `${ESC}]10;?${ST}${ESC}]11;?${ST}${ANSI_QUERIES}${ESC}[c`
const CHANNELS = "rgba?:([0-9a-f]{1,4})/([0-9a-f]{1,4})/([0-9a-f]{1,4})"
const OSC11_REPLY = new RegExp(String.raw`${ESC}\]11;${CHANNELS}`, "i")
const COLOUR_REPLY = new RegExp(String.raw`${ESC}\](10|11|4;(\d{1,2}));${CHANNELS}`, "gi")
const DA1_REPLY = new RegExp(String.raw`${ESC}\[\?[\d;]*c`)
// Only reached by a terminal that answers neither; kept generous for busy machines
const TIMEOUT_MS = 500

// One reply's channels (1 to 4 hex digits each) as 0–1
function channels(match: string[]): number[] {
  return match.map(channel => Number.parseInt(channel, 16) / (16 ** channel.length - 1))
}

// A 0–1 channel as two hex digits
function toHexByte(channel: number): string {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, "0")
}

function brightnessOf([r = 0, g = 0, b = 0]: number[]): Brightness {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "light" : "dark"
}

/** Light or dark from an OSC 11 reply (`ESC ] 11 ; rgb:RRRR/GGGG/BBBB ST`); null if it holds none. */
export function brightnessFromOsc11(reply: string): Brightness | null {
  const match = OSC11_REPLY.exec(reply)
  return match ? brightnessOf(channels(match.slice(1, 4))) : null
}

/** Light or dark from a `#rrggbb` colour. */
export function brightnessFromHex(hex: string): Brightness {
  return brightnessOf(channels([hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]))
}

/** The colours in a terminal's OSC 10, 11 and 4 replies; null when it holds none. */
export function coloursFromReply(reply: string): TerminalColours | null {
  const colours: TerminalColours = { ansi: [] }
  let found = false
  for (const match of reply.matchAll(COLOUR_REPLY)) {
    const hex = `#${channels(match.slice(3, 6)).map(toHexByte).join("")}`
    const [, kind, index] = match
    if (kind === "10") colours.foreground = hex
    else if (kind === "11") colours.background = hex
    else if (Number(index) < 16) colours.ansi[Number(index)] = hex
    else continue
    found = true
  }
  return found ? colours : null
}

/** Light or dark from `COLORFGBG` (`fg;bg` or `fg;default;bg`, set by rxvt, Konsole, iTerm2, …); null if unset or unclear. */
export function brightnessFromColorFgBg(value: string | undefined): Brightness | null {
  const bg = Number.parseInt(value?.split(";").at(-1) ?? "", 10)
  if (Number.isNaN(bg)) return null
  // ANSI 7 (white) and the bright colours from 9 up are light; 8 is bright black
  return bg === 7 || bg >= 9 ? "light" : "dark"
}

/** Asks the terminal for its colour scheme; null when stdin/stdout aren't a TTY or the terminal answers none of it. */
export function queryTerminalColours(
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout,
  timeoutMs = TIMEOUT_MS
): Promise<TerminalColours | null> {
  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve(null)
  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)

  return new Promise(resolve => {
    let received = ""
    const finish = () => {
      clearTimeout(timer)
      stdin.off("data", onData)
      stdin.setRawMode(wasRaw)
      resolve(coloursFromReply(received))
    }
    const onData = (chunk: Buffer | string) => {
      received += chunk.toString()
      if (DA1_REPLY.test(received)) finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    // No pause()/resume() around this, the same as Ink's own kitty query: under Bun a paused stdin never wakes for the
    // "readable" listener Ink attaches next, so every key is lost
    stdin.on("data", onData)
    stdout.write(QUERY)
  })
}

/**
 * The theme to render with: an explicit `dark`/`light`/`terminal` as is; `auto` (the default) goes by the terminal's
 * background, then `COLORFGBG`, then dark. The terminal's scheme is asked for every time, so `terminal` can be switched
 * to later. Call before Ink renders — the query reads stdin.
 */
export async function resolveTheme(preference: KajaPreferences["theme"]): Promise<ThemeName> {
  const fixed = preference === "auto" ? undefined : preference
  followsTerminal = !fixed
  schemeColours = await queryTerminalColours().catch(() => null)
  const background = schemeColours?.background
  schemeBrightness =
    (background ? brightnessFromHex(background) : null) ?? brightnessFromColorFgBg(Bun.env.COLORFGBG) ?? "dark"
  return setConsoleTheme(fixed ?? schemeBrightness)
}

/** {@link resolveTheme} for settings.toml's preference, read leniently (missing or broken means auto), for commands that print outside the chat screen. Call before Ink renders. */
export async function resolveConsoleTheme(): Promise<ThemeName> {
  const { readConfigLoose } = await import("./config/config")
  return resolveTheme((await readConfigLoose()).preferences?.theme)
}

let consoleThemeName: ThemeName | undefined
let followsTerminal = false
let schemeColours: TerminalColours | null = null
let schemeBrightness: Brightness = "dark"

/** Whether the last {@link resolveTheme} was for `auto`, so the chat keeps following the terminal's colour scheme. */
export function themeFollowsTerminal(): boolean {
  return followsTerminal
}

/** The terminal's colour scheme as the last {@link resolveTheme} found it; null when it didn't answer. */
export function terminalColours(): TerminalColours | null {
  return schemeColours
}

/** Whether the terminal's background is light or dark, as the last {@link resolveTheme} found it (dark until then). */
export function terminalBrightness(): Brightness {
  return schemeBrightness
}

/** Sets the theme for output printed outside the chat screen (doctor, abilities, sign-in); {@link resolveTheme} sets it too. */
export function setConsoleTheme(theme: ThemeName): ThemeName {
  consoleThemeName = theme
  return theme
}

/** The theme for output printed outside the chat screen; undefined until {@link resolveTheme} or {@link setConsoleTheme} ran. */
export function consoleTheme(): ThemeName | undefined {
  return consoleThemeName
}
