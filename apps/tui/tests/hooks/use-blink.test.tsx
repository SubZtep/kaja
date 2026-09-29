import { expect, test } from "bun:test"
import { Text } from "ink"
import { useBlink } from "../../hooks/use-blink"
import { renderForTest } from "../test-utils"

function Harness({ active }: { active: boolean }) {
  const on = useBlink(500, active)
  return <Text>{on ? "on" : "off"}</Text>
}

test("starts visible, then hides (not frozen visible) once inactive", async () => {
  const t = renderForTest(<Harness active={true} />)
  await t.tick()
  expect(t.lastFrame()).toContain("on")

  t.rerender(<Harness active={false} />)
  await t.tick()
  expect(t.lastFrame()).toContain("off")

  t.unmount()
  await t.waitUntilExit()
})

function KeyHarness({ k }: { k: string }) {
  const on = useBlink(400, true, k)
  return <Text>{on ? "on" : "off"}</Text>
}

test("a changed reset key shows the cursor again and restarts the cycle", async () => {
  const t = renderForTest(<KeyHarness k="a" />)
  // Wait for the first blink to hide it.
  for (let i = 0; i < 40 && !t.lastFrame().includes("off"); i++) await Bun.sleep(50)
  expect(t.lastFrame()).toContain("off")

  t.rerender(<KeyHarness k="b" />)
  await Bun.sleep(150)
  expect(t.lastFrame()).toContain("on")

  t.unmount()
  await t.waitUntilExit()
})
