import { type ComponentTheme, defaultTheme, extendTheme, type Theme, useComponentTheme } from "@inkjs/ui"
import type { BoxProps, TextProps } from "ink"
import type { Brightness } from "../lib/terminal-background"

export type ThemeName = Brightness

// App-wide colours that aren't an @inkjs/ui component, registered as a custom "Kaja" component so they ride the same ThemeProvider
type KajaComponentTheme = {
  styles: {
    inputBox: () => BoxProps
    userText: () => TextProps
    muted: () => TextProps
    /** The highlighted row of a menu. */
    focus: () => TextProps
  }
} & ComponentTheme

const dark: KajaComponentTheme = {
  styles: {
    inputBox: () => ({ backgroundColor: "#224", borderColor: "magenta" }),
    userText: () => ({ color: "cyanBright" }),
    muted: () => ({ color: "gray" }),
    focus: () => ({ color: "cyanBright" })
  }
}

const light: KajaComponentTheme = {
  styles: {
    inputBox: () => ({ backgroundColor: "#e8e8f4", borderColor: "magenta" }),
    userText: () => ({ color: "blue" }),
    muted: () => ({ color: "blackBright" }),
    focus: () => ({ color: "blue" })
  }
}

/** One @inkjs/ui theme per `preferences.theme`; the built-in components keep their defaults for now. */
export const themes: Record<ThemeName, Theme> = {
  dark: extendTheme(defaultTheme, { components: { Kaja: dark } }),
  light: extendTheme(defaultTheme, { components: { Kaja: light } })
}

// Outside a ThemeProvider (the doctor and abilities prompts render on their own): dark, with the blue highlight those menus have always had, readable on either background
const unthemed: KajaComponentTheme = { styles: { ...dark.styles, focus: () => ({ color: "blue" }) } }

/** Kaja's own colour styles from the nearest ThemeProvider; ink-ui's default context has no "Kaja", so outside one it's {@link unthemed}. */
export function useKajaTheme() {
  const theme: KajaComponentTheme | undefined = useComponentTheme<KajaComponentTheme>("Kaja")
  return (theme ?? unthemed).styles
}
