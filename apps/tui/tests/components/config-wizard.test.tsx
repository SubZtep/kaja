import { expect, test } from "bun:test"
import { ConfigWizard, type WizardResult } from "../../components/config-wizard"
import { setLanguage } from "../../lib/i18n"
import { renderForTest } from "../test-utils"

const DOWN = "\x1b[B"
const ESC = "\x1b"
const ENTER = "\r"
const SPACE = " "

// The providers in the order the checklist shows them.
const FIREWORKS = 0
const OLLAMA = 2
const SPEACHES = 4

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

type Wizard = ReturnType<typeof renderWizard>

/** Ticks the providers at these checklist positions (in ascending order) and continues. */
async function tick(w: Wizard, ...positions: number[]) {
  let at = 0
  for (const position of positions) {
    for (; at < position; at++) await w.t.press(DOWN)
    await w.t.press(SPACE)
  }
  await w.t.press(ENTER)
}

/** A local-provider wizard opened on the providers checklist (English kept, mode forced). */
async function openProviders(props: Partial<Parameters<typeof ConfigWizard>[0]> = {}) {
  const w = renderWizard({ mode: "local", ...props })
  await w.t.tick()
  await w.t.press(ENTER) // language: English
  return w
}

async function close(w: Wizard) {
  w.t.unmount()
  await w.t.waitUntilExit()
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

  // Cloud needs no provider or key, so Enter here lands straight on the last screen.
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Setup complete")

  await w.t.press(ENTER)
  expect(w.result).toMatchObject({ mode: "cloud", language: "en-GB" })
  expect(w.result?.providers).toBeUndefined()

  await close(w)
})

test("choosing your own provider leads to the providers checklist", async () => {
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(ENTER) // language: keep English

  await w.t.press(DOWN) // "Your own provider"
  await w.t.press(ENTER)
  const frame = w.t.lastFrame()
  expect(frame).toContain("Which model providers can you use?")
  for (const name of ["Fireworks", "xAI", "Ollama", "llama.cpp", "Speaches"]) expect(frame).toContain(name)

  await close(w)
})

test("a forced mode skips the mode step, but never the language one", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Choose your language")

  // Straight past the mode question — `--local` already answered it.
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Which model providers can you use?")
  expect(w.t.lastFrame()).not.toContain("Kaja Cloud")

  await close(w)
})

test("nothing ticked skips every provider question and leaves models.toml to the user", async () => {
  const w = await openProviders()
  await w.t.press(ENTER) // nothing ticked
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // last screen
  expect(w.result).toMatchObject({ mode: "local", providers: [] })
  expect(w.result?.keys).toBeUndefined()
  expect(w.result?.addresses).toBeUndefined()
  expect(w.t.output()).toContain("✓ Providers: none")

  await close(w)
})

test("a hosted provider is asked for its key, and a typed one is carried out of the wizard", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  expect(w.t.lastFrame()).toContain("Paste your Fireworks API key")

  await w.t.press("sk-typed-here")
  await w.t.press(ENTER)
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // last screen
  // Collected, not saved: the credential pass tests it before it reaches secrets.toml.
  expect(w.result).toMatchObject({ providers: ["fireworks"], keys: { fireworks: "sk-typed-here" } })
  expect(w.result?.addresses).toBeUndefined()

  await close(w)
})

test("skipping a key is recorded as empty, not as never having been asked", async () => {
  // The caller needs the difference: a key the user has already declined must not be asked for again.
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press(ENTER) // key: nothing typed
  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // last screen

  expect(w.result?.keys).toEqual({ fireworks: "" })
  await close(w)
})

test("a local provider is asked where it listens, never for a key", async () => {
  const w = await openProviders()
  await tick(w, OLLAMA)
  expect(w.t.lastFrame()).toContain("Where does your Ollama server listen?")
  expect(w.t.lastFrame()).toContain("11434")

  // Submitting the prefilled default keeps it, rather than storing an empty URL.
  await w.t.press(ENTER)
  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // last screen
  expect(w.result).toMatchObject({ providers: ["ollama"], addresses: { ollama: "http://localhost:11434/v1" } })
  expect(w.result?.keys).toBeUndefined()

  await close(w)
})

test("each ticked provider gets its own question, in the order shown", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS, OLLAMA, SPEACHES)
  expect(w.t.lastFrame()).toContain("Paste your Fireworks API key")

  await w.t.press(ENTER) // Fireworks key: skipped
  expect(w.t.lastFrame()).toContain("Where does your Ollama server listen?")
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Where does your Speaches server listen?")
  expect(w.t.lastFrame()).toContain("localhost:8000")

  await close(w)
})

test("a task two ticked providers can serve asks which one to use, and only that task", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS, OLLAMA)
  await w.t.press(ENTER) // Fireworks key: skipped
  await w.t.press(ENTER) // Ollama address: default

  // Both serve chat and embedding; only Fireworks serves reranking, so that is never asked.
  expect(w.t.lastFrame()).toContain("Which chat model should Kaja use?")
  expect(w.t.lastFrame()).toContain("Fireworks — accounts/fireworks/models/minimax-m3")
  expect(w.t.lastFrame()).toContain("Ollama — llama3.2:1b")

  await w.t.press(DOWN) // Ollama
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Which embedding model should Kaja use?")
  await w.t.press(ENTER) // the highlighted first one: Fireworks
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // last screen
  expect(w.result?.models).toEqual({ chat: "ollama", embedding: "fireworks" })
  const trail = w.t.output()
  expect(trail).toContain("✓ Chat model: Ollama (llama3.2:1b)")
  expect(trail).not.toContain("Reranking model")

  await close(w)
})

test("one provider that serves everything asks no model questions", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press(ENTER) // key: skipped
  expect(w.t.lastFrame()).toContain("Anything else?")
  expect(w.t.lastFrame()).not.toContain("model should Kaja use")

  await close(w)
})

test("a step that says a key is already saved offers to keep it", async () => {
  const w = await openProviders({ saved: { providers: ["fireworks"] } })
  await tick(w, FIREWORKS)
  expect(w.t.lastFrame()).toContain("already saved")

  await w.t.press(ENTER) // keep it
  expect(w.t.output()).toContain("✓ Fireworks API key: already saved, kept")

  await close(w)
})

test("each answer stays on screen and the next question opens below it", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS, OLLAMA)

  // The active question is the only thing in the last frame; what was answered is in the trail above it.
  expect(w.t.lastFrame()).toContain("Paste your Fireworks API key")
  expect(w.t.lastFrame()).not.toContain("Which model providers can you use?")
  const trail = w.t.output()
  expect(trail).toContain("✓ Language: English")
  expect(trail).toContain("✓ Providers: Fireworks, Ollama")
  // A forced mode was never asked, so it leaves no line.
  expect(trail).not.toContain("Mode:")

  await close(w)
})

test("the trail says what became of each key, without showing it", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press("fw-secret-value")
  await w.t.press(ENTER)
  await w.t.press(SPACE) // tick web search
  await w.t.press(DOWN)
  await w.t.press(SPACE) // tick Telegram
  await w.t.press(ENTER)
  await w.t.press(ENTER) // web search key: skipped
  await w.t.press(ENTER) // telegram token: skipped

  const trail = w.t.output()
  expect(trail).toContain("✓ Fireworks API key: entered, tested when you finish")
  expect(trail).toContain("✓ Brave Search API key: skipped")
  expect(trail).toContain("✓ Telegram bot token: skipped")
  expect(trail).not.toContain("fw-secret-value")
  // The answers are already on screen, so the last screen doesn't repeat them.
  expect(w.t.lastFrame()).toContain("Setup complete")
  expect(w.t.lastFrame()).not.toContain("Brave Search API key")

  await close(w)
})

test("local setups are asked about extras, cloud ones are not", async () => {
  const local = await openProviders()
  await local.t.press(ENTER) // nothing ticked
  expect(local.t.lastFrame()).toContain("Anything else?")
  await close(local)

  // Every extra is a local-agent feature, so the step never shows for cloud.
  const cloud = renderWizard({ mode: "cloud" })
  await cloud.t.tick()
  await cloud.t.press(ENTER) // language: English
  expect(cloud.t.lastFrame()).toContain("Setup complete")

  await cloud.t.press(ENTER)
  expect(cloud.result?.extras).toBeUndefined()
  await close(cloud)
})

test("the extras step starts with nothing ticked, so Enter skips it", async () => {
  const w = await openProviders()
  await w.t.press(ENTER) // providers: nothing
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // nothing ticked
  await w.t.press(ENTER) // last screen
  expect(w.result?.extras).toEqual([])

  await close(w)
})

test("each ticked extra is asked for what it needs, and untouched ones are not", async () => {
  const w = await openProviders()
  await w.t.press(ENTER) // providers: nothing
  await w.t.press(DOWN) // past web search
  await w.t.press(SPACE) // tick Telegram only
  await w.t.press(ENTER)

  // Web search wasn't ticked, so its question never appears.
  expect(w.t.lastFrame()).toContain("Telegram bot token")
  await w.t.press("bot-token")
  await w.t.press(ENTER)
  await w.t.press(ENTER) // last screen

  expect(w.result).toMatchObject({ telegramToken: "bot-token" })
  expect(w.result?.webSearchKey).toBeUndefined()

  await close(w)
})

test("each step opens on the prefilled value", async () => {
  const prefill = {
    mode: "local",
    language: "en-GB",
    providers: ["llama"],
    addresses: { llama: "http://box.local:9090/v1" }
  } as const
  const w = renderWizard({ prefill: { ...prefill, providers: ["llama"] } })
  await w.t.tick()
  await w.t.press(ENTER) // language: keeps English
  // Mode opens on "Your own provider", so Enter keeps it rather than switching to cloud.
  await w.t.press(ENTER)
  // llama.cpp is already ticked, so Enter keeps it instead of leaving nothing.
  await w.t.press(ENTER)
  // The address step opens on the saved URL, not llama.cpp's default port.
  expect(w.t.lastFrame()).toContain("box.local:9090")

  await w.t.press(ENTER) // keeps that address
  await w.t.press(ENTER) // extras: nothing ticked
  await w.t.press(ENTER) // last screen
  expect(w.result).toMatchObject(prefill)

  await close(w)
})

test("a model question opens on the provider already in use", async () => {
  const w = renderWizard({
    mode: "local",
    prefill: { providers: ["fireworks", "ollama"], models: { chat: "ollama", embedding: "fireworks" } }
  })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // providers: both still ticked
  await w.t.press(ENTER) // Fireworks key: skipped
  await w.t.press(ENTER) // Ollama address: default
  expect(w.t.lastFrame()).toContain("Which chat model should Kaja use?")

  await w.t.press(ENTER) // keeps Ollama, not the first option
  await w.t.press(ENTER) // embedding: keeps Fireworks
  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // last screen
  expect(w.result?.models).toEqual({ chat: "ollama", embedding: "fireworks" })

  await close(w)
})

test("escape cancels without producing a result", async () => {
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(ESC)

  expect(w.result).toBeUndefined()
  expect(w.cancelled).toBe(true)

  await close(w)
})

test("escape on the providers checklist cancels too", async () => {
  const w = await openProviders()
  await w.t.press(ESC)

  expect(w.cancelled).toBe(true)
  await close(w)
})

test("picking a language switches the rest of the wizard into it", async () => {
  // The point of asking first: the mode question that follows is rendered through `t()`.
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(DOWN) // Magyar
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Hogyan szeretnéd futtatni?")

  await close(w)
  // The active language is process-wide, so leave it as the other tests expect to find it.
  setLanguage("en-GB")
})
