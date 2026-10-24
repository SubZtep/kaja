import { expect, test } from "bun:test"
import { CheckMenu } from "../../components/elem/check-menu"
import { renderForTest } from "../test-utils"

const OPTIONS = [
  { label: "Fireworks", value: "fireworks" },
  { label: "Ollama", value: "ollama" },
  { label: "xAI", value: "xai" }
]

test("every row has a mark; space ticks and unticks, Enter returns the ticked values in option order", async () => {
  const submitted: string[][] = []
  const t = renderForTest(<CheckMenu options={OPTIONS} defaultValue={["xai"]} onSubmit={v => submitted.push(v)} />)
  await t.tick()
  // An empty circle on every unticked row is what tells a checklist from a single-choice list
  expect(t.lastFrame()).toContain("○ Fireworks")
  expect(t.lastFrame()).toContain("○ Ollama")
  expect(t.lastFrame()).toContain("● xAI")

  await t.press("\u001B[B") // down to Ollama
  await t.press(" ")
  expect(t.lastFrame()).toContain("● Ollama")
  await t.press("\u001B[B") // down to xAI
  await t.press(" ") // untick it
  expect(t.lastFrame()).toContain("○ xAI")
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

test("groups get a heading while nothing is typed, the filter line counts, and rows out of view are counted", async () => {
  const options = [
    { label: "Ollama", value: "ollama", group: "Found", detail: ["local", "running at localhost:11434"] },
    ...["Alpha", "Beta", "Gamma", "Delta"].map(label => ({ label, value: label.toLowerCase(), group: "Rest" }))
  ]
  const t = renderForTest(
    <CheckMenu options={options} defaultValue={["ollama"]} filterable visibleCount={4} onSubmit={() => {}} />
  )
  await t.tick()
  const frame = t.lastFrame()!
  expect(frame).toContain("1 ticked · 5 total")
  expect(frame).toContain("Found")
  expect(frame).toMatch(/● Ollama\s+local\s+running at localhost:11434/)
  // Headings take rows too: Found, Ollama, Rest, Alpha
  expect(frame).toContain("⋮ 3 more")

  await t.press("l") // Ollama, Alpha and Delta
  expect(t.lastFrame()).toContain("1 ticked · 3 match")
  // A filtered list drops its headings
  expect(t.lastFrame()).not.toContain("Found")
  t.unmount()
  await t.waitUntilExit()
})

test("Enter with nothing ticked takes the highlighted row when asked to", async () => {
  const submitted: string[][] = []
  const t = renderForTest(<CheckMenu options={OPTIONS} enterPicksFocused onSubmit={v => submitted.push(v)} />)
  await t.tick()
  await t.press("\u001B[B")
  await t.press("\r")
  expect(submitted).toEqual([["ollama"]])
  t.unmount()
  await t.waitUntilExit()
})
