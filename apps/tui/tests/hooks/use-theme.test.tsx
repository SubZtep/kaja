import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { Text } from "ink"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-use-theme`

const { useTheme } = await import("../../hooks/use-theme")
const { config, create, getConfigPath } = await import("../../lib/config/config")
const { consoleTheme, resolveTheme } = await import("../../lib/terminal-background")
const { renderForTest } = await import("../test-utils")

const DARK_REPORT = "\x1b[?997;1n"
const LIGHT_REPORT = "\x1b[?997;2n"

let toggle = () => {}
function Probe() {
  const theme = useTheme("dark")
  toggle = theme.toggle
  return <Text>theme={theme.theme}</Text>
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

test("toggling flips the theme, saves it and stops following the terminal", async () => {
  await Bun.$`rm -f ${getConfigPath()}`.quiet().nothrow()
  await create()
  await resolveTheme("auto")
  const t = renderForTest(<Probe />)
  await t.tick()
  toggle()
  await t.tick()
  expect(t.lastFrame()).toContain("theme=light")
  await t.press(DARK_REPORT)
  expect(t.lastFrame()).toContain("theme=light")
  // The save is fire-and-forget; give it a moment to land
  for (let i = 0; i < 50 && (await config()).preferences?.theme !== "light"; i++) await Bun.sleep(20)
  expect((await config()).preferences?.theme).toBe("light")
  t.unmount()
  await t.waitUntilExit()
})
