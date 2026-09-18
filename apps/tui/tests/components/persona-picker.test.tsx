import { expect, test } from "bun:test"
import { PersonaPicker } from "../../components/layout/persona-picker"
import { renderForTest } from "../test-utils"

const personas = [
  { id: "default", label: "Helpful assistant" },
  { id: "grumpy", label: "Grumpy Cat" }
]

test("marks the current persona, selecting one calls onSelect with it", async () => {
  const selected: { id: string; label: string }[] = []
  const t = renderForTest(
    <PersonaPicker
      personas={personas}
      currentPersonaId="default"
      onSelect={p => selected.push(p)}
      onCancel={() => {}}
    />
  )
  await t.tick()

  expect(t.lastFrame()).toContain("Helpful assistant ✓")
  expect(t.lastFrame()).toContain("Grumpy Cat")

  await t.press("\x1b[B")
  await t.press("\r")
  expect(selected).toEqual([{ id: "grumpy", label: "Grumpy Cat" }])

  t.unmount()
  await t.waitUntilExit()
})

test("escape cancels without selecting", async () => {
  const selected: { id: string; label: string }[] = []
  let cancelled = false
  const t = renderForTest(
    <PersonaPicker
      personas={personas}
      currentPersonaId="default"
      onSelect={p => selected.push(p)}
      onCancel={() => {
        cancelled = true
      }}
    />
  )
  await t.tick()

  await t.press("\x1b")
  expect(selected).toEqual([])
  expect(cancelled).toBe(true)

  t.unmount()
  await t.waitUntilExit()
})
