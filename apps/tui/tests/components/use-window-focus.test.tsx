import { expect, test } from "bun:test"
import { Text } from "ink"
import { useWindowFocus } from "../../hooks/use-window-focus"
import { renderForTest } from "../test-utils"

function Harness() {
  const focused = useWindowFocus()
  return <Text>{focused ? "focused" : "blurred"}</Text>
}

test("starts focused, tracks ESC[O focus-out and ESC[I focus-in, and doesn't leak into typed text", async () => {
  const t = renderForTest(<Harness />)
  await t.tick()
  expect(t.lastFrame()).toContain("focused")

  await t.press("\x1b[O")
  expect(t.lastFrame()).toContain("blurred")

  await t.press("\x1b[I")
  expect(t.lastFrame()).toContain("focused")

  t.unmount()
  await t.waitUntilExit()
})
