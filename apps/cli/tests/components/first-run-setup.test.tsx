import { expect, test } from "bun:test"
import { type FirstRunChoice, FirstRunSetup } from "../../components/first-run-setup"
import { renderForTest } from "../test-utils"

const DOWN = "[B"
const ESC = ""

test("pressing return on the first option picks the free hosted chat", async () => {
  let result: FirstRunChoice | undefined
  const t = renderForTest(<FirstRunSetup onDone={choice => (result = choice)} onCancel={() => {}} />)
  await t.tick()
  expect(t.lastFrame()).toContain("Kaja")

  await t.press("\r")
  expect(result).toEqual({ chatModelId: "kaja-free-chat" })

  t.unmount()
  await t.waitUntilExit()
})

test("choosing own provider then Ollama copies the ollama template", async () => {
  let result: FirstRunChoice | undefined
  const t = renderForTest(<FirstRunSetup onDone={choice => (result = choice)} onCancel={() => {}} />)
  await t.tick()

  await t.press(DOWN) // move to "own provider"
  await t.press("\r")
  expect(result).toBeUndefined()

  await t.press(DOWN) // move to "Ollama"
  await t.press("\r")
  expect(result).toEqual({ chatModelId: "chat-default", template: "ollama" })

  t.unmount()
  await t.waitUntilExit()
})

test("escape at the provider step cancels without saving anything", async () => {
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
