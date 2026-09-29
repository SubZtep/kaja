import { expect, test } from "bun:test"
import { Text } from "ink"
import { useQuitGuard } from "../../hooks/use-quit-guard"
import { renderForTest } from "../test-utils"

function Probe({ busy }: { busy: boolean }) {
  const { armed } = useQuitGuard(true, busy)
  return <Text>{armed ? "armed" : "idle"}</Text>
}

test("Esc while busy arms the quit instead of exiting, and a second Esc exits", async () => {
  const t = renderForTest(<Probe busy={true} />)
  await t.tick()
  expect(t.lastFrame()).toContain("idle")
  await t.press("\x1b")
  await t.tick()
  expect(t.lastFrame()).toContain("armed")
  await t.press("\x1b")
  expect(await t.waitUntilExit().then(() => true)).toBe(true)
})

test("Esc while idle exits at once", async () => {
  const t = renderForTest(<Probe busy={false} />)
  await t.tick()
  await t.press("\x1b")
  expect(await t.waitUntilExit().then(() => true)).toBe(true)
})
