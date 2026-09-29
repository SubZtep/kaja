import { expect, test } from "bun:test"
import { Box } from "ink"
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

test("wraps whole items onto another row when the terminal is narrow", async () => {
  const t = renderForTest(
    <Box width={20}>
      <KeyBar
        items={[
          { key: "Alt+L", label: "Help" },
          { key: "Alt+P", label: "Persona" },
          { key: "Alt+R", label: "Copy" }
        ]}
      />
    </Box>
  )
  await t.tick()

  const rows = t.lastFrame().split("\n")
  expect(rows.length).toBeGreaterThan(1)
  // every label survives intact on a single row
  for (const item of ["Alt+L Help", "Alt+P Persona", "Alt+R Copy"]) {
    expect(rows.some(r => r.includes(item))).toBe(true)
  }

  t.unmount()
  await t.waitUntilExit()
})
