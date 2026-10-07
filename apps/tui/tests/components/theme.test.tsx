import { expect, test } from "bun:test"
import { type StatusMessageProps, ThemeProvider, useComponentTheme } from "@inkjs/ui"
import { Text } from "ink"
import { mix, paletteFrom, schemes, terminalScheme, themes, useKajaTheme } from "../../components/theme"
import { renderForTest } from "../test-utils"

function Probe() {
  const { inputBox, userText } = useKajaTheme()
  return <Text>{`${inputBox().backgroundColor} ${userText().color}`}</Text>
}

test("falls back to the dark palette outside a ThemeProvider", () => {
  const t = renderForTest(<Probe />)
  expect(t.lastFrame()).toContain(`${mix(schemes.dark.background, schemes.dark.blue, 0.12)} ${schemes.dark.cyan}`)
  t.unmount()
})

test("the light theme swaps the palette", () => {
  const t = renderForTest(
    <ThemeProvider theme={themes.light}>
      <Probe />
    </ThemeProvider>
  )
  expect(t.lastFrame()).toContain(`${mix(schemes.light.background, schemes.light.blue, 0.12)} ${schemes.light.cyan}`)
  t.unmount()
})

function IconProbe() {
  const statusMessage = useComponentTheme<{ styles: { icon: (props: StatusMessageProps) => { color?: string } } }>(
    "StatusMessage"
  )
  return <Text>{statusMessage.styles.icon({ variant: "warning", children: "" }).color}</Text>
}

test("the light theme repaints ink-ui's own components from its palette", () => {
  const t = renderForTest(
    <ThemeProvider theme={themes.light}>
      <IconProbe />
    </ThemeProvider>
  )
  expect(t.lastFrame()).toContain(schemes.light.yellow)
  t.unmount()
})

test("mix blends one colour toward another", () => {
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080")
  expect(mix("#102030", "#102030", 0.3)).toBe("#102030")
  expect(mix("#000000", "#ff0000", 0)).toBe("#000000")
})

const SCHEME = {
  foreground: "#c5c8c6",
  background: "#1d1f21",
  ansi: [
    "#1d1f21",
    "#cc6666",
    "#b5bd68",
    "#f0c674",
    "#81a2be",
    "#b294bb",
    "#8abeb7",
    "#c5c8c6",
    "#969896",
    "#d54e53",
    "#b9ca4a",
    "#e7c547",
    "#7aa6da",
    "#c397d8",
    "#70c0b1",
    "#eaeaea"
  ]
}

test("the terminal scheme takes the bright colours on a dark background, the normal ones on a light one", () => {
  expect(terminalScheme(SCHEME, "dark")).toMatchObject({ red: "#d54e53", cyan: "#70c0b1", gray: "#969896" })
  expect(terminalScheme(SCHEME, "light")).toMatchObject({ red: "#cc6666", cyan: "#8abeb7" })
})

test("the terminal scheme names the ANSI colours the terminal didn't report", () => {
  const scheme = terminalScheme(null, "dark")
  expect(scheme).toMatchObject({ green: "greenBright", gray: "gray", background: schemes.dark.background })
  expect(terminalScheme(null, "light").green).toBe("green")
})

test("a palette's roles and tints come from its scheme", () => {
  const palette = paletteFrom(terminalScheme(SCHEME, "dark"))
  expect(palette.success).toBe("#b9ca4a")
  expect(palette.frame).toBe("#c397d8")
  expect(palette.background).toBe(SCHEME.background)
  expect(palette.tint("green", 0.2)).toBe(mix(SCHEME.background, "#b9ca4a", 0.2))
  expect(palette.gradient).toEqual(["#c397d8", "#d54e53", "#e7c547"])
})

test("a named colour is mixed as the base scheme's", () => {
  const palette = paletteFrom(terminalScheme(null, "light"), schemes.light)
  expect(palette.danger).toBe("red")
  expect(palette.tint("red", 0.5)).toBe(mix(schemes.light.background, schemes.light.red, 0.5))
  expect(palette.gradient).toEqual([schemes.light.magenta, schemes.light.red, schemes.light.yellow])
})
