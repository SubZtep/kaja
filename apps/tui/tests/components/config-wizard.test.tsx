import { expect, test } from "bun:test"
import { ConfigWizard, type WizardResult } from "../../components/config-wizard"
import { renderForTest } from "../test-utils"

const DOWN = "\x1b[B"
const ESC = "\x1b"
const ENTER = "\r"

function renderWizard(props: Partial<Parameters<typeof ConfigWizard>[0]> = {}) {
  let result: WizardResult | undefined
  let cancelled = false
  const t = renderForTest(<ConfigWizard onDone={r => (result = r)} onCancel={() => (cancelled = true)} {...props} />)
  return {
    t,
    get result() {
      return result
    },
    get cancelled() {
      return cancelled
    }
  }
}

test("opens on the mode step with Kaja Cloud preselected", async () => {
  const w = renderWizard()
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Kaja Cloud")

  // Cloud needs no provider or key, so Enter here lands on the language step and then the summary.
  await w.t.press(ENTER)
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Setup complete")

  await w.t.press(ENTER)
  expect(w.result).toMatchObject({ mode: "cloud", language: "en-GB" })
  expect(w.result?.provider).toBeUndefined()

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("choosing your own provider asks for language, then a provider", async () => {
  const w = renderWizard()
  await w.t.tick()

  await w.t.press(DOWN) // "Your own provider"
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Choose your language")

  await w.t.press(ENTER) // keep English
  expect(w.t.lastFrame()).toContain("Choose a model provider")

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("Ollama is asked where its server listens, Fireworks is not", async () => {
  // No step asks for an API key — the credential pass after the wizard does, and tests it.
  const fireworks = renderWizard({ mode: "local" })
  await fireworks.t.tick()
  await fireworks.t.press(ENTER) // language: English
  await fireworks.t.press(ENTER) // provider: Fireworks (first option)
  // Straight past the address step — Fireworks is a hosted API, not a server on this machine.
  expect(fireworks.t.lastFrame()).toContain("abilities")

  await fireworks.t.press(ENTER) // abilities
  await fireworks.t.press(ENTER) // extras: nothing ticked
  await fireworks.t.press(ENTER) // summary
  expect(fireworks.result).toMatchObject({ mode: "local", provider: "fireworks" })
  expect(fireworks.result?.baseUrl).toBeUndefined()
  fireworks.t.unmount()
  await fireworks.t.waitUntilExit()

  const ollama = renderWizard({ mode: "local" })
  await ollama.t.tick()
  await ollama.t.press(ENTER) // language: English
  await ollama.t.press(DOWN) // move to Ollama
  await ollama.t.press(ENTER)
  expect(ollama.t.lastFrame()).toContain("11434")

  // Submitting the prefilled default keeps it, rather than storing an empty URL.
  await ollama.t.press(ENTER)
  await ollama.t.press(ENTER) // abilities
  await ollama.t.press(ENTER) // extras: nothing ticked
  await ollama.t.press(ENTER) // summary
  expect(ollama.result).toMatchObject({ mode: "local", provider: "ollama", baseUrl: "http://localhost:11434/v1" })

  ollama.t.unmount()
  await ollama.t.waitUntilExit()
})

test("a forced mode skips the mode step", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Choose your language")
  expect(w.t.lastFrame()).not.toContain("Kaja Cloud")

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("each step opens on the prefilled value", async () => {
  const prefill = { mode: "local", language: "en-GB", provider: "llama", baseUrl: "http://box.local:9090/v1" } as const
  const w = renderWizard({ prefill })
  await w.t.tick()
  // Mode opens on "Your own provider", so Enter keeps it rather than switching to cloud.
  await w.t.press(ENTER)
  await w.t.press(ENTER) // language: keeps English
  // Provider opens on llama.cpp, the configured one — Enter keeps it instead of picking Fireworks.
  await w.t.press(ENTER)
  // The address step opens on the saved URL, not llama.cpp's default port.
  expect(w.t.lastFrame()).toContain("box.local:9090")

  await w.t.press(ENTER) // keeps that address
  await w.t.press(ENTER) // abilities
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // summary
  expect(w.result).toMatchObject(prefill)

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("Skip picks no provider template", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language: English
  for (let i = 0; i < 4; i++) await w.t.press(DOWN) // Fireworks → Ollama → llama.cpp → fetch → Skip
  await w.t.press(ENTER) // Skip needs no address, so this lands on abilities
  await w.t.press(ENTER) // abilities
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // summary

  expect(w.result).toMatchObject({ mode: "local", provider: "skip" })

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("local setups are asked about abilities, cloud ones are not", async () => {
  const local = renderWizard({ mode: "local" })
  await local.t.tick()
  await local.t.press(ENTER) // language: English
  await local.t.press(ENTER) // provider: Fireworks (no address step)
  expect(local.t.lastFrame()).toContain("abilities")

  await local.t.press(ENTER) // keeps the preselected recommended set
  await local.t.press(ENTER) // extras: nothing ticked
  await local.t.press(ENTER) // summary
  expect(local.result).toMatchObject({ provider: "fireworks", abilities: "starter" })
  local.t.unmount()
  await local.t.waitUntilExit()

  // Cloud abilities live in the account and are picked on the web, so the step never shows.
  const cloud = renderWizard({ mode: "cloud" })
  await cloud.t.tick()
  await cloud.t.press(ENTER) // language: English
  expect(cloud.t.lastFrame()).toContain("Setup complete")

  await cloud.t.press(ENTER)
  expect(cloud.result?.abilities).toBeUndefined()
  cloud.t.unmount()
  await cloud.t.waitUntilExit()
})

test('an already-curated machine opens the abilities step on "Not now"', async () => {
  const w = renderWizard({ mode: "local", prefill: { abilities: "none" } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // abilities: keeps "Not now" rather than adding the starter set
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // summary

  expect(w.result).toMatchObject({ abilities: "none" })

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("the extras step starts with nothing ticked, so Enter skips it", async () => {
  const w = renderWizard({ mode: "local", prefill: { abilities: "none" } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // abilities
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // nothing ticked
  await w.t.press(ENTER) // summary
  expect(w.result?.extras).toEqual([])

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("ticking an extra records it", async () => {
  const w = renderWizard({ mode: "local", prefill: { abilities: "none" } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // abilities
  await w.t.press(" ") // tick the first extra, web search
  await w.t.press(ENTER)
  await w.t.press(ENTER) // summary

  expect(w.result?.extras).toEqual(["webSearch"])

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("escape cancels without producing a result", async () => {
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(ESC)

  expect(w.result).toBeUndefined()
  expect(w.cancelled).toBe(true)

  w.t.unmount()
  await w.t.waitUntilExit()
})
