import {
  type ComponentTheme,
  defaultTheme,
  extendTheme,
  type Theme,
  ThemeContext,
  ThemeProvider,
  useComponentTheme
} from "@inkjs/ui"
import chalk, { type ForegroundColorName } from "chalk"
import type { BoxProps, TextProps } from "ink"
import { type ReactNode, useContext, useMemo } from "react"
import { type Brightness, consoleTheme } from "../lib/terminal-background"

export type ThemeName = Brightness

/** Every colour the TUI paints with, named by what it's for. Ink takes colour names or hex; `tableHead` and `tableBorder` paint markdown tables. */
export type Palette = {
  /** Kaja's pink: the persona name, the agent's "●", markdown headings. */
  accent: string
  /** Borders of menus, inputs and the chat box, and the progress bar. */
  frame: string
  /** What the user typed, and emphasis/code/links in markdown. */
  user: string
  /** The highlighted row of a menu. */
  focus: string
  muted: string
  success: string
  warning: string
  danger: string
  info: string
  /** Markdown code spans and blocks. */
  code: string
  reasoningBorder: string
  reasoningText: string
  /** The dim label of the "thinking" spinner. */
  thinking: string
  keyBackground: string
  keyText: string
  inputBackground: string
  tableHead: string
  tableBorder: string
}

const darkPalette: Palette = {
  accent: "#ff1493",
  frame: "magenta",
  user: "cyanBright",
  focus: "cyanBright",
  muted: "gray",
  success: "green",
  warning: "yellow",
  danger: "red",
  info: "blue",
  code: "yellow",
  reasoningBorder: "blueBright",
  reasoningText: "magenta",
  thinking: "magenta",
  keyBackground: "cyan",
  keyText: "black",
  inputBackground: "#224",
  tableHead: "magenta",
  tableBorder: "gray"
}

// Deeper shades of the dark set: yellow, cyan and bright colours wash out on a white background
const lightPalette: Palette = {
  accent: "#c2185b",
  frame: "#8e24aa",
  user: "blue",
  focus: "blue",
  muted: "blackBright",
  success: "#2e7d32",
  warning: "#b35c00",
  danger: "#c62828",
  info: "#1565c0",
  code: "#00695c",
  reasoningBorder: "#5c6bc0",
  reasoningText: "#6a1b9a",
  thinking: "#6a1b9a",
  keyBackground: "#00838f",
  keyText: "white",
  inputBackground: "#e8e8f4",
  tableHead: "magenta",
  tableBorder: "gray"
}

// App-wide colours that aren't an @inkjs/ui component, registered as a custom "Kaja" component so they ride the same ThemeProvider
type KajaComponentTheme = {
  palette: Palette
  styles: ReturnType<typeof kajaStyles>
} & ComponentTheme

function kajaStyles(p: Palette) {
  return {
    inputBox: (): BoxProps => ({ backgroundColor: p.inputBackground, borderColor: p.frame }),
    /** The chat box border while a power command is typed. */
    powerBox: (): BoxProps => ({ borderColor: p.success }),
    frame: (): BoxProps => ({ borderColor: p.frame }),
    reasoningBox: (): BoxProps => ({ borderColor: p.reasoningBorder }),
    accent: (): TextProps => ({ color: p.accent }),
    userText: (): TextProps => ({ color: p.user }),
    muted: (): TextProps => ({ color: p.muted }),
    /** The highlighted row of a menu. */
    focus: (): TextProps => ({ color: p.focus }),
    success: (): TextProps => ({ color: p.success }),
    warning: (): TextProps => ({ color: p.warning }),
    danger: (): TextProps => ({ color: p.danger }),
    reasoningText: (): TextProps => ({ color: p.reasoningText }),
    keyCap: (): TextProps => ({ backgroundColor: p.keyBackground, color: p.keyText }),
    thinkingLabel: (): TextProps => ({ color: p.thinking, dimColor: true }),
    toolLabel: (): TextProps => ({ color: p.success, dimColor: true })
  }
}

type KajaStyles = ReturnType<typeof kajaStyles>

function kajaTheme(palette: Palette): KajaComponentTheme {
  return { palette, styles: kajaStyles(palette) }
}

// ink-ui's own select menus: focused row in `focus`, like SelectMenu's, ticked rows in `success`
function selectTheme(p: Palette) {
  return {
    styles: {
      selectedIndicator: (): TextProps => ({ color: p.success }),
      focusIndicator: (): TextProps => ({ color: p.focus }),
      label: ({ isFocused, isSelected }: { isFocused: boolean; isSelected: boolean }): TextProps => ({
        color: isFocused ? p.focus : isSelected ? p.success : undefined
      })
    }
  }
}

const statusColor = (p: Palette) => ({ success: p.success, error: p.danger, warning: p.warning, info: p.info })

function buildTheme(p: Palette): Theme {
  return extendTheme(defaultTheme, {
    components: {
      Kaja: kajaTheme(p),
      Spinner: { styles: { frame: (): TextProps => ({ color: p.info }) } },
      Select: selectTheme(p),
      MultiSelect: selectTheme(p),
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

/** Each theme's raw colours, for output printed outside Ink (console lines). */
export const palettes: Record<ThemeName, Palette> = { dark: darkPalette, light: lightPalette }

/** chalk for a palette colour, which is a hex code or one of chalk's colour names. */
export function paint(colour: string) {
  return colour.startsWith("#") ? chalk.hex(colour) : chalk[colour as ForegroundColorName]
}

/** The colours for a console line: the console theme's, or dark before one is known. */
export function consolePalette(): Palette {
  return palettes[consoleTheme() ?? "dark"]
}

/** One @inkjs/ui theme per `preferences.theme`: Kaja's own colours plus ink-ui's components repainted from the same palette. */
export const themes: Record<ThemeName, Theme> = {
  dark: buildTheme(darkPalette),
  light: buildTheme(lightPalette)
}

// Outside a ThemeProvider (the doctor and abilities prompts render on their own): dark, with the blue highlight those menus have always had, readable on either background
const unthemed = kajaTheme({ ...darkPalette, focus: "blue" })

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

/** The surrounding theme with ink-ui's Spinner label in one of Kaja's styles, for a ThemeProvider around that one spinner. */
export function useSpinnerTheme(label: "thinkingLabel" | "toolLabel"): Theme {
  const theme = useContext(ThemeContext)
  const styles = useKajaTheme()
  return useMemo(
    () => extendTheme(theme, { components: { Spinner: { styles: { label: styles[label] } } } }),
    [theme, styles, label]
  )
}

/** Wraps a tree Ink renders on its own (doctor prompts, progress bars, status lines, the ability picker) in the console theme; before one is known, ink-ui's defaults. */
export function ConsoleTheme({ children }: Readonly<{ children: ReactNode }>) {
  const name = consoleTheme()
  return name ? <ThemeProvider theme={themes[name]}>{children}</ThemeProvider> : children
}
