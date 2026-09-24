import type { KajaPreferences } from "@kaja/schema/config"

/** A resolved theme: `auto` has been turned into one of these before the UI renders. */
export type Brightness = "dark" | "light"

// OSC 11 asks for the background colour; DA1 (CSI c) is answered by practically every terminal, and replies come in
// order, so seeing the DA1 reply means an unanswered OSC 11 is unsupported — no need to sit out the timeout
const ESC = "\u001b"
const QUERY = `${ESC}]11;?${ESC}\\${ESC}[c`
const OSC11_REPLY = new RegExp(String.raw`${ESC}\]11;rgba?:([0-9a-f]{1,4})/([0-9a-f]{1,4})/([0-9a-f]{1,4})`, "i")
const DA1_REPLY = new RegExp(String.raw`${ESC}\[\?[\d;]*c`)
// Only reached by a terminal that answers neither; kept generous for busy machines
const TIMEOUT_MS = 500

/** Light or dark from an OSC 11 reply (`ESC ] 11 ; rgb:RRRR/GGGG/BBBB ST`); null if it holds none. */
export function brightnessFromOsc11(reply: string): Brightness | null {
  const match = OSC11_REPLY.exec(reply)
  if (!match) return null
  const [r, g, b] = match.slice(1, 4).map(channel => Number.parseInt(channel, 16) / (16 ** channel.length - 1))
  const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
  return luminance > 0.5 ? "light" : "dark"
}

/** Light or dark from `COLORFGBG` (`fg;bg` or `fg;default;bg`, set by rxvt, Konsole, iTerm2, …); null if unset or unclear. */
export function brightnessFromColorFgBg(value: string | undefined): Brightness | null {
  const bg = Number.parseInt(value?.split(";").at(-1) ?? "", 10)
  if (Number.isNaN(bg)) return null
  // ANSI 7 (white) and the bright colours from 9 up are light; 8 is bright black
  return bg === 7 || bg >= 9 ? "light" : "dark"
}

/** Asks the terminal for its background colour; null when stdin/stdout aren't a TTY or the terminal doesn't answer. */
export function queryTerminalBackground(
  stdin: NodeJS.ReadStream = process.stdin,
  stdout: NodeJS.WriteStream = process.stdout,
  timeoutMs = TIMEOUT_MS
): Promise<Brightness | null> {
  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve(null)
  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)

  return new Promise(resolve => {
    let received = ""
    const finish = () => {
      clearTimeout(timer)
      stdin.off("data", onData)
      stdin.setRawMode(wasRaw)
      resolve(brightnessFromOsc11(received))
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
 * The theme to render with: an explicit `dark`/`light` as is; `auto` (the default) asks the terminal, then falls back
 * to `COLORFGBG`, then to dark. Call before Ink renders — the query reads stdin.
 */
export async function resolveTheme(preference: KajaPreferences["theme"]): Promise<Brightness> {
  const fixed = preference === "dark" || preference === "light" ? preference : undefined
  followsTerminal = !fixed
  if (fixed) return setConsoleTheme(fixed)
  const detected = await queryTerminalBackground().catch(() => null)
  return setConsoleTheme(detected ?? brightnessFromColorFgBg(Bun.env.COLORFGBG) ?? "dark")
}

/** {@link resolveTheme} for settings.toml's preference, read leniently (missing or broken means auto), for commands that print outside the chat screen. Call before Ink renders. */
export async function resolveConsoleTheme(): Promise<Brightness> {
  const { readConfigLoose } = await import("./config/config")
  return resolveTheme((await readConfigLoose()).preferences?.theme)
}

let consoleBrightness: Brightness | undefined
let followsTerminal = false

/** Whether the last {@link resolveTheme} was for `auto`, so the chat keeps following the terminal's colour scheme. */
export function themeFollowsTerminal(): boolean {
  return followsTerminal
}

/** Sets the theme for output printed outside the chat screen (doctor, abilities, sign-in); {@link resolveTheme} sets it too. */
export function setConsoleTheme(theme: Brightness): Brightness {
  consoleBrightness = theme
  return theme
}

/** The theme for output printed outside the chat screen; undefined until {@link resolveTheme} or {@link setConsoleTheme} ran. */
export function consoleTheme(): Brightness | undefined {
  return consoleBrightness
}
