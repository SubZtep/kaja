import { expect, test } from "bun:test"
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

test("one row, the items joined by a dot; what doesn't fit is cut off rather than wrapped", async () => {
  const t = renderForTest(
    <KeyBar
      width={24}
      items={[
        { key: "Alt+L", label: "help" },
        { key: "Alt+P", label: "persona" },
        { key: "Alt+R", label: "copy" }
      ]}
    />
  )
  await t.tick()

  const rows = t.lastFrame().trimEnd().split("\n")
  expect(rows).toHaveLength(1)
  expect(rows[0]!).toStartWith(" Alt+L help · Alt+P")

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
  expect(fitKeyBarItems(barItems, 70)).toEqual(barItems)
})

test("fitKeyBarItems shortens the modifier first, then drops the paging keys", () => {
  const compact = fitKeyBarItems(barItems, 60)
  expect(compact.map(i => i.key)).toEqual(["‽+L", "‽+R", "PgUp", "PgDn", "Esc"])

  const tight = fitKeyBarItems(barItems, 40)
  expect(tight.map(i => i.key)).toEqual(["‽+L", "‽+R", "Esc"])
})
