import { type ComponentTheme, defaultTheme, extendTheme, type Theme, ThemeProvider, useComponentTheme } from "@inkjs/ui"
import chalk, { type ForegroundColorName } from "chalk"
import type { BoxProps, TextProps } from "ink"
import type { ReactNode } from "react"
import {
  type Brightness,
  consoleTheme,
  type TerminalColours,
  type ThemeName,
  terminalBrightness,
  terminalColours
} from "../lib/terminal-background"

export type { ThemeName }

/** A colour scheme, shaped like a terminal's: what a theme is made of. Colours are `#rrggbb`; the terminal theme also names ANSI colours where the terminal didn't report them. */
export type Scheme = {
  /** Text on a tint (the highlighted menu row). */
  foreground: string
  /** What the tints are mixed into; also the text on a solid fill (key caps). */
  background: string
  /** Kaja's pink: the persona name, the agent's "●", markdown headings. */
  accent: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  gray: string
}

/** A scheme colour a tint can be mixed from. */
export type Hue = Exclude<keyof Scheme, "foreground" | "background">

/** What the TUI paints with, worked out from a scheme by {@link paletteFrom}: a colour per role, plus tints. Ink and chalk take colour names or hex. */
export type Palette = {
  accent: string
  /** Borders, the progress bar, reasoning, the thinking spinner and markdown table heads. */
  frame: string
  /** What the user typed, key caps, and emphasis and links in markdown. */
  user: string
  muted: string
  success: string
  warning: string
  danger: string
  info: string
  /** Markdown code. */
  code: string
  foreground: string
  background: string
  /** The mascot's and the wizard header's gradient, left to right. */
  gradient: string[]
  /** `hue` mixed `amount` (0–1) of the way into the background, for the backgrounds of badges, boxes and rows. */
  tint: (hue: Hue, amount: number) => string
}

const darkScheme: Scheme = {
  foreground: "#e8e8ea",
  background: "#16161e",
  accent: "#ff1493",
  red: "#ff6b6b",
  green: "#7fd99a",
  yellow: "#f2c55c",
  blue: "#8ab4f8",
  magenta: "#c678dd",
  cyan: "#5fd7e0",
  gray: "#8a8a96"
}

// Deeper shades: yellow, cyan and bright colours wash out on a white background
const lightScheme: Scheme = {
  foreground: "#1f1f24",
  background: "#ffffff",
  accent: "#c2185b",
  red: "#c62828",
  green: "#2e7d32",
  yellow: "#b35c00",
  blue: "#1565c0",
  magenta: "#8e24aa",
  cyan: "#00838f",
  gray: "#6b6b76"
}

/** The dark and light schemes; the terminal's comes from {@link terminalScheme}. */
export const schemes: Record<Brightness, Scheme> = { dark: darkScheme, light: lightScheme }

/** `#rrggbb` that is `amount` (0–1) of the way from `base` to `colour`, both `#rrggbb`. */
export function mix(base: string, colour: string, amount: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16)
  return `#${[1, 3, 5]
    .map(at => Math.round(channel(base, at) + (channel(colour, at) - channel(base, at)) * amount))
    .map(value => value.toString(16).padStart(2, "0"))
    .join("")}`
}

// A scheme hue's ANSI colour (0–7; the bright one is 8 more) and chalk's name for it
const ANSI: Record<Exclude<Hue, "accent" | "gray">, [number, ForegroundColorName]> = {
  red: [1, "red"],
  green: [2, "green"],
  yellow: [3, "yellow"],
  blue: [4, "blue"],
  magenta: [5, "magenta"],
  cyan: [6, "cyan"]
}

/**
 * The terminal theme's scheme: the colours the terminal reported, and ANSI names for those it didn't, so they still
 * show in its scheme. On a dark background the bright colours, which read better there; on a light one the normal ones.
 */
export function terminalScheme(colours: TerminalColours | null, brightness: Brightness): Scheme {
  const bright = brightness === "dark"
  const ansi = ([index, name]: [number, ForegroundColorName]) =>
    colours?.ansi[bright ? index + 8 : index] ?? (bright ? `${name}Bright` : name)
  return {
    foreground: colours?.foreground ?? schemes[brightness].foreground,
    background: colours?.background ?? schemes[brightness].background,
    accent: ansi(ANSI.magenta),
    red: ansi(ANSI.red),
    green: ansi(ANSI.green),
    yellow: ansi(ANSI.yellow),
    blue: ansi(ANSI.blue),
    magenta: ansi(ANSI.magenta),
    cyan: ansi(ANSI.cyan),
    gray: colours?.ansi[8] ?? "gray"
  }
}

/** A scheme's palette; a colour it only names (not `#rrggbb`) is mixed into tints and gradients as `base`'s. */
export function paletteFrom(scheme: Scheme, base: Scheme = scheme): Palette {
  const hex = (key: keyof Scheme) => (scheme[key].startsWith("#") ? scheme[key] : base[key])
  return {
    accent: scheme.accent,
    frame: scheme.magenta,
    user: scheme.cyan,
    muted: scheme.gray,
    success: scheme.green,
    warning: scheme.yellow,
    danger: scheme.red,
    info: scheme.blue,
    code: scheme.yellow,
    foreground: hex("foreground"),
    background: hex("background"),
    gradient: [hex("magenta"), hex("red"), hex("yellow")],
    tint: (hue, amount) => mix(hex("background"), hex(hue), amount)
  }
}

const darkPalette = paletteFrom(darkScheme)
const lightPalette = paletteFrom(lightScheme)

// App-wide colours that aren't an @inkjs/ui component, registered as a custom "Kaja" component so they ride the same ThemeProvider
type KajaComponentTheme = {
  palette: Palette
  styles: ReturnType<typeof kajaStyles>
} & ComponentTheme

/** A badge's tone: the hue of its text, and of the tint behind it. */
export type BadgeTone = "success" | "info" | "danger"

const BADGE_HUE: Record<BadgeTone, Hue> = { success: "green", info: "blue", danger: "red" }

function kajaStyles(p: Palette) {
  return {
    inputBox: (): BoxProps => ({ backgroundColor: p.tint("blue", 0.12), borderColor: p.frame }),
    /** The theme step's highlighted row: a band in the theme's colours, so the choice previews itself. */
    previewRow: (): BoxProps => ({ backgroundColor: p.tint("magenta", 0.3) }),
    previewText: (): TextProps => ({ color: p.foreground, bold: true }),
    /** The panel behind an answer field (a typed value or a menu), in the input box's background. */
    field: (): BoxProps => ({ backgroundColor: p.tint("blue", 0.12) }),
    /** The chat box border while a power command is typed. */
    powerBox: (): BoxProps => ({ borderColor: p.success }),
    frame: (): BoxProps => ({ borderColor: p.frame }),
    reasoningBox: (): BoxProps => ({ borderColor: p.info }),
    accent: (): TextProps => ({ color: p.accent }),
    userText: (): TextProps => ({ color: p.user }),
    /** A message the user sent: tinted band with a bar down its left edge. */
    userBox: (): BoxProps => ({ backgroundColor: p.tint("cyan", 0.15), borderColor: p.user }),
    muted: (): TextProps => ({ color: p.muted }),
    success: (): TextProps => ({ color: p.success }),
    warning: (): TextProps => ({ color: p.warning }),
    danger: (): TextProps => ({ color: p.danger }),
    reasoningText: (): TextProps => ({ color: p.frame }),
    keyCap: (): TextProps => ({ backgroundColor: p.user, color: p.background }),
    thinkingLabel: (): TextProps => ({ color: p.frame, dimColor: true }),
    toolLabel: (): TextProps => ({ color: p.success, dimColor: true }),
    /** A label such as the header's LOCAL/CLOUD/YOLO: its tone's colour on a tint of it. */
    badge: (tone: BadgeTone) => ({ background: p.tint(BADGE_HUE[tone], 0.22), text: p[tone] })
  }
}

type KajaStyles = ReturnType<typeof kajaStyles>

function kajaTheme(palette: Palette): KajaComponentTheme {
  return { palette, styles: kajaStyles(palette) }
}

const statusColor = (p: Palette) => ({ success: p.success, error: p.danger, warning: p.warning, info: p.info })

function buildTheme(p: Palette): Theme {
  return extendTheme(defaultTheme, {
    components: {
      Kaja: kajaTheme(p),
      Spinner: { styles: { frame: (): TextProps => ({ color: p.info }) } },
      ProgressBar: { styles: { completed: (): TextProps => ({ color: p.frame }) } },
      StatusMessage: {
        styles: {
          icon: ({ variant }: { variant: keyof ReturnType<typeof statusColor> }): TextProps => ({
            color: statusColor(p)[variant]
          })
        }
      }
    }
  })
}

const palettes: Record<Brightness, Palette> = { dark: darkPalette, light: lightPalette }

/** chalk for a palette colour, which is a hex code or one of chalk's colour names. */
export function paint(colour: string) {
  return colour.startsWith("#") ? chalk.hex(colour) : chalk[colour as ForegroundColorName]
}

/** The colours for a console line: the console theme's, or dark before one is known. */
export function consolePalette(): Palette {
  return paletteFor(consoleTheme() ?? "dark")
}

/** The dark and light @inkjs/ui themes: Kaja's own colours plus ink-ui's components repainted from the same palette; {@link themeFor} also has the terminal's. */
export const themes: Record<Brightness, Theme> = {
  dark: buildTheme(darkPalette),
  light: buildTheme(lightPalette)
}

// The terminal theme, built from the scheme the last resolveTheme found and rebuilt when that changes
let terminal: { colours: TerminalColours | null; brightness: Brightness; palette: Palette; theme: Theme } | undefined

function terminalTheme() {
  const colours = terminalColours()
  const brightness = terminalBrightness()
  if (terminal?.colours !== colours || terminal.brightness !== brightness) {
    const palette = paletteFrom(terminalScheme(colours, brightness), schemes[brightness])
    terminal = { colours, brightness, palette, theme: buildTheme(palette) }
  }
  return terminal
}

/** A theme's raw colours, for output printed outside Ink (console lines). */
export function paletteFor(name: ThemeName): Palette {
  return name === "terminal" ? terminalTheme().palette : palettes[name]
}

/** The @inkjs/ui theme for a resolved `preferences.theme`. */
export function themeFor(name: ThemeName): Theme {
  return name === "terminal" ? terminalTheme().theme : themes[name]
}

// Outside a ThemeProvider (the doctor and abilities prompts render on their own): the dark palette
const unthemed = kajaTheme(darkPalette)

function useKajaComponentTheme(): KajaComponentTheme {
  return useComponentTheme<KajaComponentTheme>("Kaja") ?? unthemed
}

/** Kaja's own colour styles from the nearest ThemeProvider; ink-ui's default context has no "Kaja", so outside one it's {@link unthemed}. */
export function useKajaTheme(): KajaStyles {
  return useKajaComponentTheme().styles
}

/** The raw colours of the nearest theme, for painting outside Ink's props (chalk). */
export function usePalette(): Palette {
  return useKajaComponentTheme().palette
}

/** Wraps a tree Ink renders on its own (doctor prompts, progress bars, status lines, the ability picker) in the console theme; before one is known, ink-ui's defaults. */
export function ConsoleTheme({ children }: Readonly<{ children: ReactNode }>) {
  const name = consoleTheme()
  return name ? <ThemeProvider theme={themeFor(name)}>{children}</ThemeProvider> : children
}
