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
