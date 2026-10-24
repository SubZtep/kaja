import { expect, test } from "bun:test"
import {
  chosenHooks,
  chosenProviders,
  ConfigWizard,
  providerGroups,
  type WizardResult
} from "../../components/config-wizard"
import { padLabel } from "../../components/elem/rail"
import { setLanguage } from "../../lib/i18n"
import { CATALOG, setCatalog } from "../../lib/models/catalog"
import { TEST_CATALOG } from "../fixtures/catalog"
import { renderForTest } from "../test-utils"

setCatalog(TEST_CATALOG)

const DOWN = "\x1b[B"
const ESC = "\x1b"
const ENTER = "\r"
const SPACE = " "

// The providers in the order the checklist shows them with nothing found: the popular ones, Custom, then the rest
const ORDER = (() => {
  const groups = providerGroups(CATALOG, () => false)
  return [...groups.popular.map(provider => provider.id), "custom", ...groups.rest.map(provider => provider.id)]
})()
const at = (id: string) => ORDER.indexOf(id)
const FIREWORKS = at("fireworks")
const OLLAMA = at("ollama")
const SPEACHES = at("speaches")
const CUSTOM = at("custom")

/** An answer as the open block shows it: on the rail, the label padded to the value column. */
const answered = (label: string, value: string) => `│ ${padLabel(label)}${value}`

function renderWizard(props: Partial<Parameters<typeof ConfigWizard>[0]> = {}) {
  let result: WizardResult | undefined
  let cancelled = false
  // No env by default, so a key set on this machine can't tick anything
  const t = renderForTest(
    <ConfigWizard env={{}} onDone={r => (result = r)} onCancel={() => (cancelled = true)} {...props} />
  )
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

/** Ticks the providers at these checklist positions and continues. */
async function tick(w: Wizard, ...positions: number[]) {
  let row = 0
  for (const position of positions.toSorted((a, b) => a - b)) {
    for (; row < position; row++) await w.t.press(DOWN)
    await w.t.press(SPACE)
  }
  await w.t.press(ENTER)
}

/** A local-provider wizard opened on the providers checklist (English kept, mode forced). */
async function openProviders(props: Partial<Parameters<typeof ConfigWizard>[0]> = {}) {
  const w = renderWizard({ mode: "local", ...props })
  await w.t.tick()
  await w.t.press(ENTER) // language: English
  await w.t.press(ENTER) // theme: keep the highlighted one
  return w
}

/** Enter through the tasks and model questions, taking what each opens on, up to the extras. */
async function acceptModels(w: Wizard) {
  for (let step = 0; step < 10 && !w.t.lastFrame()?.includes("Anything else?"); step++) await w.t.press(ENTER)
}

/** Ticks Ollama, keeps its default address and the default tasks: the least a local setup can answer. */
async function pickOllama(w: Wizard) {
  await tick(w, OLLAMA)
  await w.t.press(ENTER) // address: the default
  await acceptModels(w)
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
  await w.t.press(ENTER) // theme: keep the highlighted one
  expect(w.t.lastFrame()).toContain("Kaja Cloud")

  // Cloud needs no provider or key, so Enter here is the last answer, and the wizard finishes without another.
  await w.t.press(ENTER)
  expect(w.result).toMatchObject({ mode: "cloud", language: "en-GB" })
  expect(w.result?.providers).toBeUndefined()

  await close(w)
})

test("sounds, notifications and speech are a last block, asked only for the programs found", async () => {
  const w = renderWizard({ mode: "cloud", hookPrograms: { player: "paplay", speaker: "espeak-ng" } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // theme
  expect(w.t.lastFrame()).toContain("Sounds 1/2")
  expect(w.t.lastFrame()).toContain("Play sound effects")
  await w.t.press(ENTER) // sounds: yes
  // No notifier was found, so speech is next; it starts on No
  expect(w.t.lastFrame()).toContain("Read the assistant's messages aloud with espeak-ng?")
  await w.t.press(ENTER)
  expect(w.t.output()).toContain("Sounds        Sound effects · Read aloud off")
  expect(chosenHooks(w.result!, { player: "paplay", speaker: "espeak-ng" })).toEqual({
    sounds: true,
    notifications: false,
    speech: false
  })

  await close(w)
})

test("a re-run opens the sound questions on what hooks.toml has", async () => {
  const programs = { player: "paplay", notifier: "notify-send" }
  const w = renderWizard({ mode: "cloud", hookPrograms: programs, prefill: { hooks: { sounds: false } } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // theme
  await w.t.press(ENTER) // sounds: kept off
  await w.t.press(ENTER) // notifications: on by default
  expect(chosenHooks(w.result!, programs)).toEqual({ sounds: false, notifications: true, speech: false })

  await close(w)
})

test("the theme step follows the language, opens on the detected theme and is carried out", async () => {
  const w = renderWizard({ prefill: { theme: "light" } })
  await w.t.tick()
  await w.t.press(ENTER) // language: English
  expect(w.t.lastFrame()).toContain("Which colours read best in this terminal?")
  expect(w.t.lastFrame()).toContain("❯ Light background")

  await w.t.press(ENTER)
  await w.t.press(ENTER) // mode: cloud
  expect(w.result?.theme).toBe("light")

  await close(w)
})

test("choosing your own provider leads to the providers checklist", async () => {
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(ENTER) // language: keep English
  await w.t.press(ENTER) // theme: keep the highlighted one

  await w.t.press(DOWN) // "Your own provider"
  await w.t.press(ENTER)
  const frame = w.t.lastFrame()
  expect(frame).toContain("Which AI providers will you use?")
  for (const name of ["Fireworks", "xAI", "OpenRouter", "Ollama", "llama.cpp", "Speaches"])
    expect(frame).toContain(name)

  await close(w)
})

test("a forced mode skips the mode step, but never the language one", async () => {
  const w = renderWizard({ mode: "local" })
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Choose your language")

  // Straight past the mode question — `--local` already answered it.
  await w.t.press(ENTER)
  await w.t.press(ENTER) // theme
  expect(w.t.lastFrame()).toContain("Which AI providers will you use?")
  expect(w.t.lastFrame()).not.toContain("Kaja Cloud")

  await close(w)
})

test("providers whose key is in the environment come first and ticked; typing filters the list", async () => {
  const w = await openProviders({ env: { XAI_API_KEY: "sk-env" } })
  const frame = w.t.lastFrame()!
  expect(frame).toContain("● xAI")
  expect(frame.indexOf("xAI")).toBeLessThan(frame.indexOf("Fireworks"))

  await w.t.press("olla")
  expect(w.t.lastFrame()).toContain("Ollama")
  expect(w.t.lastFrame()).not.toContain("Fireworks")
  await w.t.press(SPACE) // ticks Ollama, the one row left
  await w.t.press(ENTER)
  expect(w.result).toBeUndefined()
  expect(w.t.output()).toContain(answered("Providers", "xAI, Ollama"))

  await close(w)
})

test("well-known providers come before the rest of the catalog", async () => {
  const w = await openProviders()
  const frame = w.t.lastFrame()!
  // xAI and OpenRouter are popular; Fireworks (as the test catalog names it) is not
  expect(frame.indexOf("xAI")).toBeLessThan(frame.indexOf("Fireworks"))
  expect(frame.indexOf("OpenRouter")).toBeLessThan(frame.indexOf("Fireworks"))

  await close(w)
})

test("Enter with nothing ticked takes the highlighted provider", async () => {
  const w = await openProviders()
  await w.t.press(ENTER) // OpenRouter, the first popular one, is highlighted
  expect(w.t.output()).toContain(answered("Providers", "OpenRouter"))
  expect(w.t.lastFrame()).toContain("Paste your OpenRouter API key")

  await close(w)
})

test("the providers step won't continue with nothing ticked or highlighted: local mode needs a model", async () => {
  const w = await openProviders()
  await w.t.press("zzz") // filters every row away
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Which AI providers will you use?")
  expect(w.t.lastFrame()).toContain("Tick at least one")
  for (let i = 0; i < 3; i++) await w.t.press("\x7f") // clear the filter

  await pickOllama(w)
  expect(w.t.lastFrame()).toContain("Anything else?")
  await w.t.press(ENTER) // extras: nothing ticked
  expect(w.result).toMatchObject({ mode: "local", providers: ["ollama"] })
  expect(w.t.output()).toContain(answered("Providers", "Ollama"))

  await close(w)
})

test("a hosted provider is asked for its key, and a typed one is carried out of the wizard", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  expect(w.t.lastFrame()).toContain("Paste your Fireworks API key")

  await w.t.press("sk-typed-here")
  await w.t.press(ENTER)
  await acceptModels(w)
  await w.t.press(ENTER) // extras: nothing ticked
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
  await acceptModels(w)
  await w.t.press(ENTER) // extras

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
  await acceptModels(w)
  await w.t.press(ENTER) // extras
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

test("the tasks step offers what the ticked providers can do, with chat, memory, summaries and vision ticked", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press(ENTER) // key: skipped
  expect(w.t.lastFrame()).toContain("What should Kaja be able to do?")
  const frame = w.t.lastFrame()!
  expect(frame).toContain("● Chat")
  expect(frame).toContain("○ Reranking")
  // Nobody ticked serves voice, so it isn't offered
  expect(frame).not.toMatch(/speech/i)

  await w.t.press(SPACE) // untick chat
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Chat is needed")
  await close(w)
})

test("each ticked task with more than one model asks which, newest tool-calling one first", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS, OLLAMA)
  await w.t.press(ENTER) // Fireworks key: skipped
  await w.t.press(ENTER) // Ollama address: default
  await w.t.press(ENTER) // tasks: the defaults

  expect(w.t.lastFrame()).toContain("Which chat model should Kaja use?")
  // The model first, the Fireworks prefix dropped, then its provider and release month; the opening row says why
  expect(w.t.lastFrame()).toMatch(/❯ minimax-m3\s+Fireworks\s+best guess/)
  expect(w.t.lastFrame()).toMatch(/qwen3\.5:4b\s+Ollama/)

  await w.t.press("qwen") // filter down to Ollama's
  expect(w.t.lastFrame()).not.toContain("minimax")
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Which embedding model should Kaja use?")
  await w.t.press(ENTER) // the highlighted first one: Fireworks
  expect(w.t.lastFrame()).toContain("Which summarising model should Kaja use?")
  await w.t.press(ENTER)
  // Vision opens on the chat pick, which can see
  expect(w.t.lastFrame()).toMatch(/❯ qwen3\.5:4b\s+Ollama/)
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // extras
  expect(w.result?.models).toEqual({
    chat: { provider: "ollama", model: "qwen3.5:4b" },
    embedding: { provider: "fireworks", model: "accounts/fireworks/models/qwen3-embedding-8b" },
    summarize: { provider: "fireworks", model: "accounts/fireworks/models/minimax-m3" },
    vision: { provider: "ollama", model: "qwen3.5:4b" }
  })
  expect(w.t.output()).toContain(answered("Chat model", "Ollama (qwen3.5:4b)"))

  await close(w)
})

test("a task with one model to choose from isn't asked", async () => {
  const w = await openProviders()
  await tick(w, OLLAMA)
  await w.t.press(ENTER) // address
  await w.t.press(ENTER) // tasks
  expect(w.t.lastFrame()).toContain("Anything else?")
  expect(w.t.output()).not.toContain("model should Kaja use")

  await close(w)
})

test("a step that says a key is already saved offers to keep it", async () => {
  const w = await openProviders({ saved: { providers: ["fireworks"] } })
  await tick(w, FIREWORKS)
  expect(w.t.lastFrame()).toContain("Enter keeps the saved key")

  await w.t.press(ENTER) // keep it
  // The Providers block is finished, so it's folded into one line
  expect(w.t.output()).toContain("Fireworks · keys set: 1")

  await close(w)
})

test("each answer stays on screen and the next question opens below it", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS, OLLAMA)

  // The active question is the only thing in the last frame; what was answered is in the trail above it.
  expect(w.t.lastFrame()).toContain("Paste your Fireworks API key")
  expect(w.t.lastFrame()).not.toContain("Which AI providers will you use?")
  const trail = w.t.output()
  expect(trail).toContain(answered("Language", "British English"))
  expect(trail).toContain(answered("Providers", "Fireworks, Ollama"))
  // A forced mode was never asked, so it leaves no line.
  expect(trail).not.toContain("Mode:")

  await close(w)
})

test("the trail says what became of each key, without showing it", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press("fw-secret-value")
  await w.t.press(ENTER)
  await acceptModels(w)
  await w.t.press(SPACE) // tick Telegram
  await w.t.press(ENTER)
  await w.t.press(ENTER) // telegram token: skipped

  // Every block is finished, so each is folded into its line
  const trail = w.t.output()
  expect(w.t.output()).toContain("Fireworks · keys set: 1")
  expect(w.t.lastFrame()).toContain("Telegram bot, no token")
  expect(trail).not.toContain("fw-secret-value")
  // Nothing follows the last answer: no closing screen claiming it's all done while the setup still runs.
  expect(w.result).toBeDefined()
  expect(w.t.output()).not.toContain("Setup complete")

  await close(w)
})

test("local setups are asked about extras, cloud ones are not", async () => {
  const local = await openProviders()
  await pickOllama(local)
  expect(local.t.lastFrame()).toContain("Anything else?")
  await close(local)

  // Every extra is a local-agent feature, so the step never shows for cloud.
  const cloud = renderWizard({ mode: "cloud" })
  await cloud.t.tick()
  await cloud.t.press(ENTER) // language: English
  await cloud.t.press(ENTER) // theme: keep the highlighted one
  expect(cloud.result).toBeDefined()
  expect(cloud.result?.extras).toBeUndefined()
  await close(cloud)
})

test("the extras step starts with nothing ticked, so Enter skips it", async () => {
  const w = await openProviders()
  await pickOllama(w)
  expect(w.t.lastFrame()).toContain("Anything else?")

  await w.t.press(ENTER) // nothing ticked
  expect(w.result?.extras).toEqual([])

  await close(w)
})

test("with git, the marketplace is asked in Extras, and auto-update only while it's on", async () => {
  const w = await openProviders({ gitReady: true })
  await pickOllama(w)
  await w.t.press(ENTER) // extras: nothing ticked
  expect(w.t.lastFrame()).toContain("Extras 2/3")
  expect(w.t.lastFrame()).toContain("Use the online marketplace")
  await w.t.press(DOWN) // No, stay offline
  await w.t.press(ENTER)
  // Off, so there's nothing to keep up to date: that was the last question
  expect(w.result).toMatchObject({ marketplace: false })
  expect(w.t.output()).toContain("Marketplace off")

  await close(w)
})

test("the marketplace questions open on the current settings", async () => {
  const w = await openProviders({ gitReady: true, prefill: { marketplace: true, autoFetch: false } })
  await pickOllama(w)
  await w.t.press(ENTER) // extras
  await w.t.press(ENTER) // marketplace: kept on
  expect(w.t.lastFrame()).toContain("Keep the marketplace up to date")
  await w.t.press(ENTER) // auto-update: kept off
  expect(w.result).toMatchObject({ marketplace: true, autoFetch: false })

  await close(w)
})

test("a ticked extra is asked for what it needs", async () => {
  const w = await openProviders()
  await pickOllama(w)
  await w.t.press(SPACE) // tick Telegram
  await w.t.press(ENTER)

  expect(w.t.lastFrame()).toContain("Telegram bot token")
  await w.t.press("bot-token")
  await w.t.press(ENTER)

  expect(w.result).toMatchObject({ telegramToken: "bot-token" })

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
  await w.t.press(ENTER) // theme: keep the highlighted one
  // Mode opens on "Your own provider", so Enter keeps it rather than switching to cloud.
  await w.t.press(ENTER)
  // llama.cpp is already ticked, so Enter keeps it instead of leaving nothing.
  await w.t.press(ENTER)
  // The address step opens on the saved URL, not llama.cpp's default port.
  expect(w.t.lastFrame()).toContain("box.local:9090")

  await w.t.press(ENTER) // keeps that address
  await acceptModels(w)
  await w.t.press(ENTER) // extras: nothing ticked
  expect(w.result).toMatchObject(prefill)

  await close(w)
})

test("a model question opens on the model already in use", async () => {
  const qwen = { provider: "ollama", model: "qwen3.5:4b" }
  const w = renderWizard({
    mode: "local",
    prefill: { providers: ["fireworks", "ollama"], tasks: ["chat"], models: { chat: qwen } }
  })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // theme: keep the highlighted one
  await w.t.press(ENTER) // providers: both still ticked
  await w.t.press(ENTER) // Fireworks key: skipped
  await w.t.press(ENTER) // Ollama address: default
  // Only chat was set up before, so only chat is ticked
  expect(w.t.lastFrame()).toContain("○ Embedding")
  await w.t.press(ENTER)
  // The model from models.toml, tagged as in use
  expect(w.t.lastFrame()).toMatch(/❯ qwen3\.5:4b\s+Ollama\s+in use/)

  await w.t.press(ENTER) // keeps Ollama, not the first option
  await w.t.press(ENTER) // extras
  expect(w.result?.models).toEqual({ chat: qwen })
  expect(w.result?.tasks).toEqual(["chat"])

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

test("backspace on a menu doesn't cancel: the wizard stays on the question", async () => {
  // Backspace is a typo-fixing reflex, and cancelling would throw every answer so far away.
  const w = renderWizard()
  await w.t.tick()
  await w.t.press("\x7f")
  expect(w.cancelled).toBe(false)
  expect(w.t.lastFrame()).toContain("Choose your language")

  await close(w)
})

test("escape on a later question goes back to the previous one, on its answer", async () => {
  const w = await openProviders({ prefill: { theme: "light" } })
  await w.t.press(ESC)

  expect(w.cancelled).toBe(false)
  expect(w.t.lastFrame()).toContain("Which colours read best in this terminal?")
  expect(w.t.lastFrame()).toContain("❯ Light background")
  // Back again to the language, and once more cancels: there is nothing before it
  await w.t.press(ESC)
  expect(w.t.lastFrame()).toContain("Choose your language")
  await w.t.press(ESC)
  expect(w.cancelled).toBe(true)

  await close(w)
})

test("going back keeps the answers, and a changed one replaces its line", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press(ESC) // back to the checklist, Fireworks still ticked
  expect(w.t.lastFrame()).toContain("● Fireworks")
  for (let row = 0; row < OLLAMA; row++) await w.t.press(DOWN)
  await w.t.press(SPACE) // Ollama
  await w.t.press(ENTER)

  expect(w.t.lastFrame()).toContain(answered("Providers", "Fireworks, Ollama"))
  expect(w.t.lastFrame()).not.toContain(answered("Providers", "Fireworks\n"))
  await close(w)
})

test("a key typed earlier is kept when you come back past it", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS)
  await w.t.press("fw-secret")
  await w.t.press(ENTER)
  await w.t.press(ESC) // back from the tasks to the key
  expect(w.t.lastFrame()).toContain("Enter keeps the key you typed")
  await w.t.press(ENTER)
  await acceptModels(w)
  await w.t.press(ENTER) // extras

  expect(w.result?.keys).toEqual({ fireworks: "fw-secret" })
  await close(w)
})

test("the header shows the blocks, where you are and the question count; finished blocks fold", async () => {
  const w = await openProviders()
  expect(w.t.lastFrame()).toContain("✓ Basics › Providers 1/1 › Extras")
  expect(w.t.lastFrame()).toContain("✓ Basics        British English · Dark colours")

  await tick(w, FIREWORKS, OLLAMA)
  // A key and an address joined the block
  expect(w.t.lastFrame()).toContain("Providers 2/3")
  await close(w)
})

test("cloud mode has only the Basics block", async () => {
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // theme
  expect(w.t.lastFrame()).toContain("Basics 3/3 › Providers")
  await w.t.press(ENTER) // cloud
  expect(w.t.lastFrame()).toContain("✓ Basics")
  expect(w.t.lastFrame()).not.toContain("Providers")
  await close(w)
})

test("picking a language switches the rest of the wizard into it", async () => {
  // The point of asking first: the mode question that follows is rendered through `t()`.
  const w = renderWizard()
  await w.t.tick()
  await w.t.press(DOWN) // American English
  await w.t.press(DOWN) // Magyar
  await w.t.press(ENTER)
  await w.t.press(ENTER) // theme
  expect(w.t.lastFrame()).toContain("Hogyan szeretnéd futtatni?")

  await close(w)
  // The active language is process-wide, so leave it as the other tests expect to find it.
  setLanguage("en-GB")
})

/** Types an answer and submits it. */
async function type(w: Wizard, text: string) {
  await w.t.press(text)
  await w.t.press(ENTER)
}

/** Empties the input the way a person fixing a wrong answer would: a rejected answer stays in the field. */
async function erase(w: Wizard, length: number) {
  for (let i = 0; i < length; i++) await w.t.press("\x7f")
}

test("a custom provider is asked its name, address, key, then each model and what it is for", async () => {
  const w = await openProviders()
  await tick(w, CUSTOM)
  expect(w.t.lastFrame()).toContain("What should this provider be called?")

  await type(w, "LM Studio")
  expect(w.t.lastFrame()).toContain("What is its base URL?")
  await type(w, "http://localhost:1234/v1")
  expect(w.t.lastFrame()).toContain("Paste your lm-studio API key")
  await w.t.press(ENTER) // key: skipped, it needs none
  expect(w.t.lastFrame()).toContain("Which lm-studio model should Kaja use?")

  await type(w, "llama-3.2-1b-instruct")
  expect(w.t.lastFrame()).toContain("What is llama-3.2-1b-instruct used for?")
  await w.t.press(ENTER) // chat, the first choice
  expect(w.t.lastFrame()).toContain("Another lm-studio model?")

  await w.t.press(ENTER) // empty: that's all
  expect(w.t.lastFrame()).toContain("Anything else?")
  await w.t.press(ENTER) // extras

  expect(w.result?.providers).toEqual(["custom"])
  expect(w.result?.custom).toEqual({
    name: "lm-studio",
    baseUrl: "http://localhost:1234/v1",
    models: [{ model: "llama-3.2-1b-instruct", task: "chat" }],
    done: true
  })
  expect(w.result?.keys).toEqual({ "lm-studio": "" })
  const trail = w.t.output()
  expect(trail).toContain(answered("Custom provider", "lm-studio"))
  expect(trail).toContain(answered("lm-studio server", "http://localhost:1234/v1"))
  expect(trail).toContain(answered("Custom model", "llama-3.2-1b-instruct (chat)"))

  await close(w)
})

test("a wrong answer keeps the question open and says what is wrong", async () => {
  const w = await openProviders()
  await tick(w, CUSTOM)
  await type(w, "!!!") // nothing usable in a name like that
  expect(w.t.lastFrame()).toContain("Use letters, numbers and dashes")
  expect(w.t.lastFrame()).toContain("What should this provider be called?")
  await erase(w, 3)
  await type(w, "vllm")

  await type(w, "not a url")
  expect(w.t.lastFrame()).toContain("That isn't a web address")
  expect(w.t.lastFrame()).toContain("What is its base URL?")
  await erase(w, 9)
  await type(w, "ftp://box/v1") // a URL, but not one an HTTP API answers on
  expect(w.t.lastFrame()).toContain("That isn't a web address")
  await erase(w, 12)
  await type(w, "http://box:8000/v1")

  await w.t.press(ENTER) // key: skipped
  await w.t.press(ENTER) // first model, empty
  expect(w.t.lastFrame()).toContain("Type at least one model id.")
  expect(w.t.lastFrame()).toContain("Which vllm model should Kaja use?")

  await close(w)
})

test("models are listed until an empty answer, each with its own task", async () => {
  const w = await openProviders()
  await tick(w, CUSTOM)
  await type(w, "vllm")
  await type(w, "http://box:8000/v1")
  await w.t.press(ENTER) // key: skipped

  await type(w, "big-chat")
  await w.t.press(ENTER) // chat
  await type(w, "small-embedder")
  await w.t.press(DOWN) // embedding
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Another vllm model?")
  await w.t.press(ENTER) // done
  await acceptModels(w)
  await w.t.press(ENTER) // extras

  expect(w.result?.custom?.models).toEqual([
    { model: "big-chat", task: "chat" },
    { model: "small-embedder", task: "embedding" }
  ])

  await close(w)
})

test("a name the catalog already uses gets a suffix, so it can't shadow a built-in provider", async () => {
  const w = await openProviders()
  await tick(w, CUSTOM)
  await type(w, "Ollama")
  expect(w.t.lastFrame()).toContain("What is its base URL?")
  await type(w, "http://box:11434/v1")
  expect(w.t.lastFrame()).toContain("Paste your ollama-custom API key")

  await close(w)
})

test("a custom model that overlaps a built-in provider joins the model question", async () => {
  const w = await openProviders()
  await tick(w, CUSTOM, OLLAMA)
  await w.t.press(ENTER) // Ollama address: default
  await type(w, "vllm")
  await type(w, "http://box:8000/v1")
  await w.t.press(ENTER) // key: skipped
  await type(w, "big-chat")
  await w.t.press(ENTER) // chat
  await w.t.press(ENTER) // that's all
  await w.t.press(ENTER) // tasks: the defaults

  // Ollama and the custom provider both serve chat, so the user is asked which one Kaja should use.
  expect(w.t.lastFrame()).toContain("Which chat model should Kaja use?")
  expect(w.t.lastFrame()).toMatch(/qwen3\.5:4b\s+Ollama/)
  expect(w.t.lastFrame()).toMatch(/big-chat\s+vllm/)
  await w.t.press(DOWN)
  await w.t.press(ENTER)
  // Only chat overlaps: Ollama serves embedding too, but the custom provider does not.
  expect(w.t.lastFrame()).toContain("Anything else?")
  await w.t.press(ENTER) // extras
  expect(w.result?.models).toEqual({ chat: { provider: "vllm", model: "big-chat" } })

  await close(w)
})

test("a custom provider already in models.toml opens on its answers, and Enter keeps them", async () => {
  const custom = {
    name: "vllm",
    baseUrl: "http://box:8000/v1",
    models: [{ model: "big-chat", task: "chat" as const }]
  }
  const w = renderWizard({ mode: "local", prefill: { providers: ["custom"], custom } })
  await w.t.tick()
  await w.t.press(ENTER) // language
  await w.t.press(ENTER) // theme: keep the highlighted one
  await w.t.press(ENTER) // providers: custom still ticked
  await w.t.press(ENTER) // name: kept
  expect(w.t.lastFrame()).toContain("http://box:8000/v1")
  await w.t.press(ENTER) // address: kept
  await w.t.press(ENTER) // key: skipped
  expect(w.t.lastFrame()).toContain("big-chat")
  await w.t.press(ENTER) // model: kept, not duplicated
  await w.t.press(ENTER) // task: kept
  expect(w.t.lastFrame()).toContain("Another vllm model?")
  await w.t.press(ENTER) // that's all
  await w.t.press(ENTER) // extras

  expect(w.result?.custom?.models).toEqual([{ model: "big-chat", task: "chat" }])

  await close(w)
})

test("without a catalog there is no checklist: the wizard goes straight to the user's own provider", async () => {
  setCatalog(undefined)
  try {
    const w = await openProviders()
    expect(w.t.lastFrame()).toContain("What should this provider be called?")
    await type(w, "ollama")
    await type(w, "http://localhost:11434/v1")
    await w.t.press(ENTER) // key: skipped
    await type(w, "qwen3.5:4b")
    await w.t.press(ENTER) // chat
    await w.t.press(ENTER) // that's all
    await w.t.press(ENTER) // extras

    expect(chosenProviders(w.result!)).toEqual([
      {
        id: "ollama",
        name: "ollama",
        kind: "hosted",
        baseUrl: "http://localhost:11434/v1",
        models: [{ model: "qwen3.5:4b", tasks: ["chat"] }],
        own: true
      }
    ])
    await close(w)
  } finally {
    setCatalog(TEST_CATALOG)
  }
})

test("the models the custom server lists are offered to pick from, with typing one still possible", async () => {
  const asked: unknown[] = []
  const w = await openProviders({
    listModels: async (...args) => {
      asked.push(args)
      return ["alpha", "beta"]
    }
  })
  await tick(w, CUSTOM)
  await type(w, "box")
  await type(w, "http://box:8000/v1")
  await type(w, "secret")
  await w.t.tick()
  expect(asked).toEqual([["http://box:8000/v1", "box", "secret"]])
  expect(w.t.lastFrame()).toContain("Which box model should Kaja use?")
  expect(w.t.lastFrame()).toContain("Type a model id myself")

  await w.t.press(DOWN) // beta; the list opens on alpha, below the typing choice
  await w.t.press(ENTER)
  await w.t.press(ENTER) // chat
  // alpha is still offered, beta isn't; "That's all" ends the list
  expect(w.t.lastFrame()).toContain("Another box model?")
  expect(w.t.lastFrame()?.split("Another box model?")[1]).not.toContain("beta")
  await w.t.press("\x1b[A") // up from alpha to "That's all"
  await w.t.press(ENTER)
  await w.t.press(ENTER) // extras

  expect(w.result?.custom?.models).toEqual([{ model: "beta", task: "chat" }])
  await close(w)
})

test("a server that lists no models falls back to typing the id", async () => {
  const w = await openProviders({ listModels: async () => [] })
  await tick(w, CUSTOM)
  await type(w, "box")
  await type(w, "http://box:8000/v1")
  await w.t.press(ENTER) // key: skipped
  await w.t.tick()
  expect(w.t.lastFrame()).toContain("Type its id, as the provider names it.")
  await close(w)
})

test("providers kept from models.toml are written back with the ticked ones", async () => {
  const kept = { id: "other", name: "other", kind: "hosted" as const, baseUrl: "https://other.test/v1", models: [] }
  expect(chosenProviders({ providers: ["ollama"], keep: [kept] }).map(provider => provider.id)).toEqual([
    "ollama",
    "other"
  ])
})

test("a key is tested against its provider while it's typed, never with the key on screen", async () => {
  const targets: unknown[] = []
  const w = await openProviders({
    probe: async target => {
      targets.push(target)
      return { tone: "ok", note: "Accepted: it lists 3 models." }
    }
  })
  await tick(w, FIREWORKS)
  await w.t.press("fw-live")
  const deadline = Date.now() + 5000
  while (!w.t.lastFrame()?.includes("Accepted") && Date.now() < deadline) await Bun.sleep(50)
  expect(w.t.lastFrame()).toContain("✓ Accepted: it lists 3 models.")
  expect(w.t.lastFrame()).not.toContain("fw-live")
  expect(targets).toEqual([{ kind: "key", baseUrl: "https://api.fireworks.ai/inference/v1", key: "fw-live" }])
  await close(w)
})

test("a key already in the environment is read from there, copied, or replaced by a typed one", async () => {
  const env = { FIREWORKS_API_KEY: "fw-env" }
  const reach = async () => {
    const w = await openProviders({ env })
    await w.t.press(ENTER) // providers: Fireworks came ticked
    expect(w.t.lastFrame()).toContain("Your Fireworks key is already in $FIREWORKS_API_KEY")
    return w
  }

  const read = await reach()
  await read.t.press(ENTER) // read it from the environment
  await acceptModels(read)
  await read.t.press(ENTER) // extras
  expect(read.result?.keyEnv).toEqual({ fireworks: "FIREWORKS_API_KEY" })
  expect(read.result?.keys).toEqual({})
  expect(read.t.output()).toContain("Fireworks · keys set: 1")
  expect(read.t.output()).not.toContain("fw-env")
  await close(read)

  const copy = await reach()
  await copy.t.press(DOWN)
  await copy.t.press(ENTER)
  await acceptModels(copy)
  await copy.t.press(ENTER)
  expect(copy.result?.keys).toEqual({ fireworks: "fw-env" })
  expect(copy.result?.keyEnv).toEqual({})
  await close(copy)

  const typed = await reach()
  await typed.t.press(DOWN)
  await typed.t.press(DOWN)
  await typed.t.press(ENTER)
  expect(typed.t.lastFrame()).toContain("Paste your Fireworks API key")
  await close(typed)
})

test("a server found running comes first and ticked, and needs no address question", async () => {
  const local = [
    {
      id: "vllm",
      name: "vLLM",
      kind: "self-hosted" as const,
      baseUrl: "http://127.0.0.1:8000/v1",
      models: [{ model: "qwen3:8b", tasks: ["chat" as const, "summarize" as const] }]
    }
  ]
  const w = await openProviders({ prefill: { local } })
  expect(w.t.lastFrame()).toContain("● vLLM")
  await w.t.press(ENTER) // providers: vLLM came ticked
  await acceptModels(w)
  expect(w.t.output()).not.toContain("Where does your vLLM server listen?")
  await w.t.press(ENTER) // extras
  expect(chosenProviders(w.result!).map(provider => provider.id)).toEqual(["vllm"])
  expect(w.result?.models).toBeUndefined()

  await close(w)
})

test("offline, a server found running is offered beside your own provider", async () => {
  setCatalog(undefined)
  try {
    const local = [
      {
        id: "ollama",
        name: "Ollama",
        kind: "self-hosted" as const,
        baseUrl: "http://127.0.0.1:11434/v1",
        models: [{ model: "llama3.2:latest", tasks: ["chat" as const] }]
      }
    ]
    const w = await openProviders({ prefill: { local } })
    expect(w.t.lastFrame()).toContain("Which AI providers will you use?")
    expect(w.t.lastFrame()).toContain("● Ollama")
    expect(w.t.lastFrame()).toContain("running at")
    await close(w)
  } finally {
    setCatalog(TEST_CATALOG)
  }
})

test("a saved custom provider's models are reviewed in one list, not asked one by one", async () => {
  const custom = {
    name: "box",
    baseUrl: "https://box.test/v1",
    models: [
      { model: "big", task: "chat" as const },
      { model: "embedder", task: "embedding" as const }
    ],
    saved: true,
    done: true
  }
  const w = await openProviders({ prefill: { providers: ["custom"], custom } })
  await w.t.press(ENTER) // providers: Custom kept
  await w.t.press(ENTER) // name
  await w.t.press(ENTER) // address
  await w.t.press(ENTER) // key: skipped
  expect(w.t.lastFrame()).toContain("Which box models should stay?")
  expect(w.t.lastFrame()).toContain("● big (chat)")
  await w.t.press(DOWN) // embedder
  await w.t.press(SPACE) // drop it
  await w.t.press(ENTER)
  await acceptModels(w)
  await w.t.press(ENTER) // extras
  expect(w.result?.custom?.models).toEqual([{ model: "big", task: "chat" }])
  expect(w.t.output()).not.toContain("Which box model should Kaja use?")
  await close(w)
})

test("ticking the review's last row asks for one more model after the kept ones", async () => {
  const custom = {
    name: "box",
    baseUrl: "https://box.test/v1",
    models: [{ model: "big", task: "chat" as const }],
    saved: true,
    done: true
  }
  const w = await openProviders({ prefill: { providers: ["custom"], custom } })
  for (let step = 0; step < 4; step++) await w.t.press(ENTER) // providers, name, address, key
  await w.t.press(DOWN) // "Add another model"
  await w.t.press(SPACE)
  await w.t.press(ENTER)
  expect(w.t.lastFrame()).toContain("Another box model?")
  await close(w)
})

test("the open block shows its latest answers, counting the older ones above them", async () => {
  const w = await openProviders()
  await tick(w, FIREWORKS, OLLAMA, at("llama"), at("xai"), at("openrouter"))
  for (let step = 0; step < 4; step++) await w.t.press(ENTER) // keys and addresses
  expect(w.t.lastFrame()).toContain("earlier answers")
  expect(w.t.lastFrame()).not.toContain("✓  Providers:")
  await close(w)
})
