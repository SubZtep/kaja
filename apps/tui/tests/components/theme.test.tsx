import { expect, test } from "bun:test"
import { ThemeProvider } from "@inkjs/ui"
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
