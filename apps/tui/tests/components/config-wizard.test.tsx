import { expect, test } from "bun:test"
import { ConfigWizard, type WizardResult } from "../../components/config-wizard"
import { setLanguage } from "../../lib/i18n"
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

test("opens on the language step, then asks the mode with Kaja Cloud preselected", async () => {
  // Language is first because every question after it is only answerable by someone who can read it.
  const w = renderWizard()
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Choose your language")
  // Each name carries its code, so a language you can't read is still identifiable.
  expect(w.t.lastFrame()).toContain("English")
  expect(w.t.lastFrame()).toContain("en-GB")
  expect(w.t.lastFrame()).toContain("nan-TW")

  await w.t.press(ENTER) // keep English
  expect(w.t.lastFrame()).toContain("Kaja Cloud")

  // Cloud needs no provider or key, so Enter here lands straight on the summary.
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Setup complete")

  await w.t.press(ENTER)
  expect(w.result).toMatchObject({ mode: "cloud", language: "en-GB" })
  expect(w.result?.provider).toBeUndefined()

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("choosing your own provider leads to the provider step", async () => {
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(ENTER) // language: keep English

  await w.t.press(DOWN) // "Your own provider"
  await w.t.press(ENTER)
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
  // Straight past the address step — Fireworks is a hosted API, so it's asked for a key instead.
  expect(fireworks.t.lastFrame()).toContain("API key")

  await fireworks.t.press(ENTER) // key: skipped
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
  // A server on this machine takes no key, so it goes straight to the address.
  expect(ollama.t.lastFrame()).toContain("11434")

  // Submitting the prefilled default keeps it, rather than storing an empty URL.
  await ollama.t.press(ENTER)
  await ollama.t.press(ENTER) // extras: nothing ticked
  await ollama.t.press(ENTER) // summary
  expect(ollama.result).toMatchObject({ mode: "local", provider: "ollama", baseUrl: "http://localhost:11434/v1" })

  ollama.t.unmount()
  await ollama.t.waitUntilExit()
})

test("a forced mode skips the mode step, but never the language one", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Choose your language")

  // Straight past the mode question — `--local` already answered it.
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Choose a model provider")
  expect(w.t.lastFrame()).not.toContain("Kaja Cloud")

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("each step opens on the prefilled value", async () => {
  const prefill = { mode: "local", language: "en-GB", provider: "llama", baseUrl: "http://box.local:9090/v1" } as const
  const w = renderWizard({ prefill })
  await w.t.tick()
  await w.t.press(ENTER) // language: keeps English
  // Mode opens on "Your own provider", so Enter keeps it rather than switching to cloud.
  await w.t.press(ENTER)
  // Provider opens on llama.cpp, the configured one — Enter keeps it instead of picking Fireworks.
  await w.t.press(ENTER)
  // The address step opens on the saved URL, not llama.cpp's default port.
  expect(w.t.lastFrame()).toContain("box.local:9090")

  await w.t.press(ENTER) // keeps that address
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
  for (let i = 0; i < 3; i++) await w.t.press(DOWN) // Fireworks → Ollama → llama.cpp → Skip
  await w.t.press(ENTER) // Skip needs no address, so this lands on extras
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // summary

  expect(w.result).toMatchObject({ mode: "local", provider: "skip" })

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("local setups are asked about extras, cloud ones are not", async () => {
  const local = renderWizard({ mode: "local" })
  await local.t.tick()
  await local.t.press(ENTER) // language: English
  await local.t.press(ENTER) // provider: Fireworks (no address step)
  await local.t.press(ENTER) // key: skipped
  expect(local.t.lastFrame()).toContain("Anything else?")

  await local.t.press(ENTER) // extras: nothing ticked
  await local.t.press(ENTER) // summary
  expect(local.result).toMatchObject({ provider: "fireworks" })
  local.t.unmount()
  await local.t.waitUntilExit()

  // Every extra is a local-agent feature, so the step never shows for cloud.
  const cloud = renderWizard({ mode: "cloud" })
  await cloud.t.tick()
  await cloud.t.press(ENTER) // language: English
  expect(cloud.t.lastFrame()).toContain("Setup complete")

  await cloud.t.press(ENTER)
  expect(cloud.result?.extras).toBeUndefined()
  cloud.t.unmount()
  await cloud.t.waitUntilExit()
})

test("the extras step starts with nothing ticked, so Enter skips it", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // key: skipped
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // nothing ticked
  await w.t.press(ENTER) // summary
  expect(w.result?.extras).toEqual([])

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("ticking an extra records it", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // key: skipped
  await w.t.press(" ") // tick the first extra, web search
  await w.t.press(ENTER)
  await w.t.press(ENTER) // its key: skipped
  await w.t.press(ENTER) // summary

  expect(w.result?.extras).toEqual(["webSearch"])

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("a hosted provider is asked for its key, and a typed one is carried out of the wizard", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  expect(w.t.lastFrame()).toContain("Paste your fireworks API key")

  await w.t.press("sk-typed-here")
  await w.t.press(ENTER)
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // summary
  // Collected, not saved: the credential pass tests it before it reaches secrets.toml.
  expect(w.result?.providerKey).toBe("sk-typed-here")

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("skipping a key is recorded as empty, not as never having been asked", async () => {
  // The caller needs the difference: a key the user has already declined must not be asked for again.
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // key: nothing typed
  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // summary

  expect(w.result?.providerKey).toBe("")
  w.t.unmount()
  await w.t.waitUntilExit()
})

test("a local provider is never asked for a key", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(DOWN) // Ollama
  await w.t.press(ENTER)
  await w.t.press(ENTER) // keeps the default address
  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // summary

  expect(w.result?.providerKey).toBeUndefined()
  w.t.unmount()
  await w.t.waitUntilExit()
})

test("a step that says a key is already saved offers to keep it", async () => {
  const w = renderWizard({ mode: "local", saved: { providers: ["fireworks"] } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  expect(w.t.lastFrame()).toContain("already saved")

  w.t.unmount()
  await w.t.waitUntilExit()
})

test("each ticked extra is asked for what it needs, and untouched ones are not", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // provider: Fireworks
  await w.t.press(ENTER) // key: skipped
  await w.t.press(DOWN) // past web search
  await w.t.press(DOWN) // past voice
  await w.t.press(" ") // tick Telegram only
  await w.t.press(ENTER)

  // Web search and voice weren't ticked, so their questions never appear.
  expect(w.t.lastFrame()).toContain("Telegram user id")
  await w.t.press("123456")
  await w.t.press(ENTER)

  expect(w.t.lastFrame()).toContain("Telegram bot token")
  await w.t.press("bot-token")
  await w.t.press(ENTER)
  await w.t.press(ENTER) // summary

  expect(w.result).toMatchObject({ telegramId: "123456", telegramToken: "bot-token" })
  expect(w.result?.webSearchKey).toBeUndefined()
  expect(w.result?.voiceUrl).toBeUndefined()

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

test("picking a language switches the rest of the wizard into it", async () => {
  // The point of asking first: the mode question that follows is rendered through `t()`.
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(DOWN) // Magyar
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Hogyan szeretnéd futtatni?")

  w.t.unmount()
  await w.t.waitUntilExit()
  // The active language is process-wide, so leave it as the other tests expect to find it.
  setLanguage("en-GB")
})
