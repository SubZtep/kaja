import { expect, test } from "bun:test"
import { Box } from "ink"
import { fitKeyBarItems, KeyBar, type KeyBarEntry } from "../../components/layout/key-bar"
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

const barItems: KeyBarEntry[] = [
  { key: "Ctrl+L", short: "‽+L", label: "Help" },
  { key: "Ctrl+R", short: "‽+R", label: "Copy" },
  { key: "PgUp", label: "Older", droppable: true },
  { key: "PgDn", label: "Newer", droppable: true },
  { key: "Esc", label: "Quit" }
]

test("fitKeyBarItems keeps everything while it fits", () => {
  expect(fitKeyBarItems(barItems, 60)).toEqual(barItems)
})

test("fitKeyBarItems shortens the modifier first, then drops the paging keys", () => {
  const compact = fitKeyBarItems(barItems, 55)
  expect(compact.map(i => i.key)).toEqual(["‽+L", "‽+R", "PgUp", "PgDn", "Esc"])

  const tight = fitKeyBarItems(barItems, 40)
  expect(tight.map(i => i.key)).toEqual(["‽+L", "‽+R", "Esc"])
})
