import { expect, test } from "bun:test"
import { Text } from "ink"

const { useTheme } = await import("../../hooks/use-theme")
const { consoleTheme, resolveTheme } = await import("../../lib/terminal-background")
const { renderForTest } = await import("../test-utils")

const DARK_REPORT = "\x1b[?997;1n"
const LIGHT_REPORT = "\x1b[?997;2n"

function Probe() {
  return <Text>theme={useTheme("dark")}</Text>
}

test("with an auto theme, follows the terminal's colour-scheme reports", async () => {
  await resolveTheme("auto")
  const t = renderForTest(<Probe />)
  await t.tick()
  await t.press(LIGHT_REPORT)
  expect(t.lastFrame()).toContain("theme=light")
  expect(consoleTheme()).toBe("light")
  await t.press(DARK_REPORT)
  expect(t.lastFrame()).toContain("theme=dark")
  t.unmount()
  await t.waitUntilExit()
})

test("with a fixed theme, ignores the reports", async () => {
  await resolveTheme("dark")
  const t = renderForTest(<Probe />)
  await t.tick()
  await t.press(LIGHT_REPORT)
  expect(t.lastFrame()).toContain("theme=dark")
  t.unmount()
  await t.waitUntilExit()
})
