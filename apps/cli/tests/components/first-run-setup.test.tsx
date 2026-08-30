import { expect, test } from "bun:test"
import { type FirstRunChoice, FirstRunSetup } from "../../components/first-run-setup"
import { renderForTest } from "../test-utils"

const DOWN = "[B"
const ESC = ""

test("pressing return on the first option picks the fireworks template", async () => {
  let result: FirstRunChoice | undefined
  const t = renderForTest(<FirstRunSetup onDone={choice => (result = choice)} onCancel={() => {}} />)
  await t.tick()
  expect(t.lastFrame()).toContain("Kaja")

  await t.press("\r")
  expect(result).toEqual({ template: "fireworks" })

  t.unmount()
  await t.waitUntilExit()
})

test("choosing Ollama copies the ollama template", async () => {
  let result: FirstRunChoice | undefined
  const t = renderForTest(<FirstRunSetup onDone={choice => (result = choice)} onCancel={() => {}} />)
  await t.tick()

  await t.press(DOWN) // move to "Ollama"
  await t.press("\r")
  expect(result).toEqual({ template: "ollama" })

  t.unmount()
  await t.waitUntilExit()
})

test("choosing Skip picks no template", async () => {
  let result: FirstRunChoice | undefined
  const t = renderForTest(<FirstRunSetup onDone={choice => (result = choice)} onCancel={() => {}} />)
  await t.tick()

  await t.press(DOWN) // move to "Ollama"
  await t.press(DOWN) // move to "Skip"
  await t.press("\r")
  expect(result).toEqual({})

  t.unmount()
  await t.waitUntilExit()
})

test("escape cancels without saving anything", async () => {
  let result: FirstRunChoice | undefined
  let cancelled = false
  const t = renderForTest(<FirstRunSetup onDone={choice => (result = choice)} onCancel={() => (cancelled = true)} />)
  await t.tick()

  await t.press(ESC)
  expect(result).toBeUndefined()
  expect(cancelled).toBe(true)

  t.unmount()
  await t.waitUntilExit()
})
