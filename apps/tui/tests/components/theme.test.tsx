import { expect, test } from "bun:test"
import { type StatusMessageProps, ThemeProvider, useComponentTheme } from "@inkjs/ui"
import { Text } from "ink"
import { themes, useKajaTheme } from "../../components/theme"
import { renderForTest } from "../test-utils"

function Probe() {
  const { inputBox, userText } = useKajaTheme()
  return <Text>{`${inputBox().backgroundColor} ${userText().color}`}</Text>
}

test("falls back to the dark palette outside a ThemeProvider", () => {
  const t = renderForTest(<Probe />)
  expect(t.lastFrame()).toContain("#224 cyanBright")
  t.unmount()
})

test("the light theme swaps the palette", () => {
  const t = renderForTest(
    <ThemeProvider theme={themes.light}>
      <Probe />
    </ThemeProvider>
  )
  expect(t.lastFrame()).toContain("#e8e8f4 blue")
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
  expect(t.lastFrame()).toContain("#b35c00")
  t.unmount()
})
