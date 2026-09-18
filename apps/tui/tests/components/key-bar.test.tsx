import { expect, test } from "bun:test"
import { KeyBar } from "../../components/layout/key-bar"
import { renderForTest } from "../test-utils"

test("renders each item's key and label", async () => {
  const t = renderForTest(
    <KeyBar
      items={[
        { key: "Alt+H", label: "Help" },
        { key: "Alt+P", label: "Persona" }
      ]}
    />
  )
  await t.tick()

  const frame = t.lastFrame()
  expect(frame).toContain("Alt+H")
  expect(frame).toContain("Help")
  expect(frame).toContain("Alt+P")
  expect(frame).toContain("Persona")

  t.unmount()
  await t.waitUntilExit()
})
