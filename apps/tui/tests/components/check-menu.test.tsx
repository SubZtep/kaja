import { expect, test } from "bun:test"
import { CheckMenu } from "../../components/elem/check-menu"
import { renderForTest } from "../test-utils"

const OPTIONS = [
  { label: "Fireworks", value: "fireworks" },
  { label: "Ollama", value: "ollama" },
  { label: "xAI", value: "xai" }
]

test("every row has a box; space ticks and unticks, Enter returns the ticked values in option order", async () => {
  const submitted: string[][] = []
  const t = renderForTest(<CheckMenu options={OPTIONS} defaultValue={["xai"]} onSubmit={v => submitted.push(v)} />)
  await t.tick()
  // An empty box on every unticked row is what tells a checklist from a single-choice list
  expect(t.lastFrame()).toContain("[ ] Fireworks")
  expect(t.lastFrame()).toContain("[ ] Ollama")
  expect(t.lastFrame()).toContain("[✔] xAI")

  await t.press("\u001B[B") // down to Ollama
  await t.press(" ")
  expect(t.lastFrame()).toContain("[✔] Ollama")
  await t.press("\u001B[B") // down to xAI
  await t.press(" ") // untick it
  expect(t.lastFrame()).toContain("[ ] xAI")
  await t.press("\u001B[A")
  await t.press("\u001B[A")
  await t.press(" ") // tick Fireworks last, yet it comes first
  await t.press("\r")
  expect(submitted).toEqual([["fireworks", "ollama"]])
  t.unmount()
  await t.waitUntilExit()
})

test("escape dismisses", async () => {
  let closed = false
  const t = renderForTest(
    <CheckMenu
      options={OPTIONS}
      onSubmit={() => {}}
      onClose={() => {
        closed = true
      }}
    />
  )
  await t.tick()
  await t.press("\u001B")
  expect(closed).toBe(true)
  t.unmount()
  await t.waitUntilExit()
})
