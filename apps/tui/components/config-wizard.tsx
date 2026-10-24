import { ThemeProvider } from "@inkjs/ui"
import type { ModelTask } from "@kaja/schema/config"
import { LOCALE_LABELS, locales } from "@kaja/shared/locale"
import { capitalized } from "@kaja/shared/text"
import { Box, Static, Text } from "ink"
import { useEffect, useRef, useState } from "react"
import type { KajaMode } from "../lib/config/mode"
import type { Language } from "../lib/i18n"
import { setLanguage, t } from "../lib/i18n"
import { candidatesByTask, CATALOG, type CatalogProvider, catalogProvider, TASK_ORDER } from "../lib/models/catalog"
import type { ThemeName } from "../lib/terminal-background"
import { CheckMenu } from "./elem/check-menu"
import { Answered, Question, RailLine } from "./elem/rail"
import { SelectMenu } from "./elem/select-menu"
import { InputPrompt, Problem } from "./secret-prompt"
import { themeFor } from "./theme"

/** Optional features, each needing one more answer afterwards. None is ticked by default. */
export type WizardExtra = "telegram"

const EXTRA_CHOICES: WizardExtra[] = ["telegram"]

const EXTRA_LABEL_KEY: Record<WizardExtra, string> = {
  telegram: "wizard.extraTelegram"
}

/** A provider that isn't in the catalog: any OpenAI-compatible server the user names. */
export type WizardCustom = {
  /** The `[providers.<name>]` key, already reduced to letters, numbers and dashes. */
  name?: string
  baseUrl?: string
  /** Its models. A model waits for its task, which is asked right after the id. */
  models: { model: string; task?: ModelTask }[]
  /** The user has listed all the models they want. */
  done?: boolean
}

/** What the checklist stores for "a provider that isn't listed". */
const CUSTOM = "custom"

/**
 * Everything the wizard collects. The keys are asked for here rather than by the credential pass afterwards, so a key
 * is typed while its question is still on screen; but nothing is written here: the caller hands them to that pass,
 * which tests and saves each one.
 *
 * `""` means the step was shown and skipped, `undefined` that it never applied. The caller needs both: a key the user
 * has already declined must not be asked for a second time.
 */
export type WizardResult = {
  mode?: KajaMode
  language?: Language
  /** Prefilled with the saved theme, else the one detected from the terminal's background. */
  theme?: ThemeName
  /**
   * The ticked catalog providers, in catalog order, and `custom` last when that was ticked. Never empty once asked:
   * local mode can't start without one.
   */
  providers?: string[]
  custom?: WizardCustom
  /**
   * Providers models.toml already has that the wizard doesn't ask about (the catalog doesn't know them, and the custom
   * steps cover only one): written back as they are, so a re-run never drops them.
   */
  keep?: CatalogProvider[]
  /** Typed API keys by provider id; only hosted providers are asked. */
  keys?: Record<string, string>
  /** Where each local provider's server listens. */
  addresses?: Record<string, string>
  /** The provider that serves each task more than one ticked provider could. */
  models?: Partial<Record<ModelTask, string>>
  extras?: WizardExtra[]
  telegramToken?: string
}

/** Which secrets are already in secrets.toml, so their step can offer to keep what's there. */
export type WizardSaved = {
  /** Provider names with an `api_key` already saved — a list, since the step can pick any of them. */
  providers?: string[]
  telegram?: boolean
}

/**
 * One question. The key, address and model steps repeat, so they carry what they are about: `key:fireworks`,
 * `address:ollama`, `model:chat`.
 */
type Step =
  | "mode"
  | "language"
  | "theme"
  | "providers"
  | `key:${string}`
  | `address:${string}`
  | `model:${ModelTask}`
  | "custom-name"
  | "custom-url"
  | "custom-key"
  | `custom-model:${number}`
  | `custom-task:${number}`
  | "extras"
  | "telegramToken"
  | "done"

const TASK_LABEL_KEY: Record<ModelTask, string> = {
  chat: "wizard.taskChat",
  embedding: "wizard.taskEmbedding",
  rerank: "wizard.taskRerank",
  "image-generation": "wizard.taskImageGeneration",
  tts: "wizard.taskTts",
  stt: "wizard.taskStt",
  summarize: "wizard.taskSummarize",
  vision: "wizard.taskVision"
}

const MODE_CHOICES: KajaMode[] = ["cloud", "local"]

const THEME_CHOICES: ThemeName[] = ["dark", "light", "terminal"]

const THEME_LABEL_KEY: Record<ThemeName, string> = {
  dark: "wizard.themeDark",
  light: "wizard.themeLight",
  terminal: "wizard.themeTerminal"
}

/** A name reduced to what a TOML table key and a secrets.toml entry can carry; never one the catalog already owns. */
function customId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return catalogProvider(id) ? `${id}-custom` : id
}

/** Whether `value` is an http(s) address, the only kind an OpenAI-compatible API can be reached on. */
function isWebAddress(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/**
 * The ticked providers. Without a catalog (offline) there is nothing to tick: the user's own provider is the only
 * one, asked for detail by detail.
 */
function tickedProviders(result: WizardResult): string[] {
  return CATALOG.length === 0 ? [CUSTOM] : (result.providers ?? [])
}

/** The custom provider as a catalog entry, once it has an address and at least one model with its task. */
function customProvider(result: WizardResult): CatalogProvider | undefined {
  const custom = result.custom
  if (!tickedProviders(result).includes(CUSTOM) || !custom?.name || !custom.baseUrl) return undefined
  const models = custom.models.flatMap(({ model, task }) => (task ? [{ model, task }] : []))
  if (models.length === 0) return undefined
  return { id: custom.name, name: custom.name, kind: "hosted", baseUrl: custom.baseUrl, models }
}

/** The ticked providers from the catalog, in catalog order. */
function catalogChoices(result: WizardResult): CatalogProvider[] {
  return CATALOG.filter(provider => result.providers?.includes(provider.id))
}

/**
 * Every ticked provider, then the custom one, then those kept from models.toml. Exported for the runner, which writes
 * models.toml from it.
 */
export function chosenProviders(result: WizardResult): CatalogProvider[] {
  const custom = customProvider(result)
  const keep = (result.keep ?? []).filter(provider => provider.id !== custom?.id)
  return [...catalogChoices(result), ...(custom ? [custom] : []), ...keep]
}

/**
 * The tasks more than one ticked provider can serve: the only model questions worth asking (vision follows the chat
 * pick, see `buildModelsToml`).
 */
function contestedTasks(result: WizardResult): ModelTask[] {
  const candidates = candidatesByTask(chosenProviders(result))
  return TASK_ORDER.filter(task => task !== "vision" && (candidates[task]?.length ?? 0) > 1)
}

/**
 * Every question this set of answers leads to, in order. Cloud needs no provider; a hosted provider is asked for a key
 * and a local one for an address; a model is asked about only where the ticked providers overlap; and each extra's
 * follow-up only when that extra was ticked. Recomputed after every answer, so a skipped step never mounts just to
 * advance out of itself.
 */
function stepsFor(result: WizardResult, forcedMode?: KajaMode): Step[] {
  // `--cloud`/`--local` already answered the mode. A prefilled mode does not: that's the current
  // setting being re-offered, which the user is here to change.
  const steps: Step[] = forcedMode === undefined ? ["language", "theme", "mode"] : ["language", "theme"]
  if (result.mode === "cloud") return [...steps, "done"]

  if (CATALOG.length > 0) steps.push("providers")
  for (const provider of catalogChoices(result)) {
    steps.push(provider.kind === "hosted" ? `key:${provider.id}` : `address:${provider.id}`)
  }
  if (tickedProviders(result).includes(CUSTOM)) {
    steps.push("custom-name", "custom-url", "custom-key")
    const models = result.custom?.models ?? []
    models.forEach((_, index) => {
      steps.push(`custom-model:${index}`, `custom-task:${index}`)
    })
    // Ask for another model until the user ends the list, but never while the last one still needs its task.
    if (!result.custom?.done && models.at(-1)?.task !== undefined) steps.push(`custom-model:${models.length}`)
    else if (models.length === 0) steps.push("custom-model:0")
  }
  for (const task of contestedTasks(result)) steps.push(`model:${task}`)
  // Every extra is a local-agent feature: the Telegram bot.
  steps.push("extras")
  if (result.extras?.includes("telegram")) steps.push("telegramToken")
  steps.push("done")
  return steps
}

function nextStepAfter(step: Step, result: WizardResult, forcedMode?: KajaMode): Step {
  const steps = stepsFor(result, forcedMode)
  const at = steps.indexOf(step)
  if (at !== -1) return steps[at + 1] ?? "done"
  // The step that just ended the custom model list is no longer in the list, so carry on after the custom ones.
  const lastCustom = steps.findLastIndex(candidate => candidate.startsWith("custom"))
  return steps[lastCustom + 1] ?? "done"
}

function providerName(id: string): string {
  return catalogProvider(id)?.name ?? (id === CUSTOM ? "Custom" : id)
}

/**
 * What happened to a key step: typed, left empty over one already saved, or left empty. Undefined when the step never
 * applied.
 */
function keyState(typed: string | undefined, alreadySaved: boolean | undefined): string | undefined {
  if (typed === undefined) return undefined
  if (typed) return t("wizard.keyStateEntered")
  return t(alreadySaved ? "wizard.keyStateKept" : "wizard.keyStateSkipped")
}

/** One answered step, kept on screen above the next question. */
type Answer = { id: string; label: string; value: string }

/** What the trail prints, once each: the header, then every answer. */
type TrailItem = Answer | { id: "header" }

type AnswerLine = Pick<Answer, "label" | "value"> | undefined
type AnswerLineFn = (subject: string, result: WizardResult, saved?: WizardSaved) => AnswerLine

// A key step's line: never the key itself, only what became of it.
function keyLine(label: string, typed: string | undefined, alreadySaved: boolean | undefined): AnswerLine {
  const value = keyState(typed, alreadySaved)
  return value ? { label, value } : undefined
}

// A line only when there is a value to show.
function lineIf(label: string, value: string | undefined): AnswerLine {
  return value ? { label, value } : undefined
}

const ANSWER_LINES: Record<string, AnswerLineFn> = {
  language: (_, result) => lineIf(t("wizard.summaryLanguage"), result.language && LOCALE_LABELS[result.language]),
  theme: (_, result) => lineIf(t("wizard.summaryTheme"), result.theme && t(THEME_LABEL_KEY[result.theme])),
  mode: (_, result) =>
    lineIf(
      t("wizard.summaryMode"),
      result.mode && t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")
    ),
  providers: (_, result) => ({
    label: t("wizard.summaryProvider"),
    value: (result.providers ?? []).map(providerName).join(", ")
  }),
  key: (subject, result, saved) =>
    keyLine(
      t("wizard.summaryKeyProvider", { provider: providerName(subject) }),
      result.keys?.[subject],
      saved?.providers?.includes(subject)
    ),
  address: (subject, result) =>
    lineIf(t("wizard.summaryAddress", { provider: providerName(subject) }), result.addresses?.[subject]),
  model: (subject, result) => {
    const task = subject as ModelTask
    const picked = candidatesByTask(chosenProviders(result))[task]?.find(c => c.provider === result.models?.[task])
    return lineIf(
      capitalized(t("wizard.summaryModel", { task: t(TASK_LABEL_KEY[task]) })),
      picked && `${providerName(picked.provider)} (${picked.model})`
    )
  },
  "custom-name": (_, result) => lineIf(t("wizard.summaryCustom"), result.custom?.name),
  "custom-url": (_, result) =>
    lineIf(t("wizard.summaryAddress", { provider: result.custom?.name ?? "" }), result.custom?.baseUrl),
  "custom-key": (_, result, saved) => {
    const id = result.custom?.name ?? ""
    return keyLine(t("wizard.summaryKeyProvider", { provider: id }), result.keys?.[id], saved?.providers?.includes(id))
  },
  "custom-task": (subject, result) => {
    const entry = result.custom?.models[Number(subject)]
    return lineIf(t("wizard.summaryCustomModel"), entry?.task && `${entry.model} (${t(TASK_LABEL_KEY[entry.task])})`)
  },
  extras: (_, result) =>
    lineIf(
      t("wizard.summaryExtras"),
      result.extras?.length ? result.extras.map(e => t(EXTRA_LABEL_KEY[e])).join(", ") : undefined
    ),
  telegramToken: (_, result, saved) => keyLine(t("wizard.summaryKeyTelegram"), result.telegramToken, saved?.telegram)
}

/**
 * The line a finished step leaves behind. Never a key's value, only what became of it. A step that recorded nothing (no
 * extras ticked) leaves no line.
 */
function answerLine(step: Step, result: WizardResult, saved?: WizardSaved): AnswerLine {
  const [kind, subject = ""] = step.split(":") as [string, string | undefined]
  return ANSWER_LINES[kind]?.(subject, result, saved)
}

/** The trail's first line: the mascot. */
function Header() {
  return (
    <RailLine marker={<Text dimColor>┌</Text>}>
      <Text>༼☉ω⊙༽🪄</Text>
    </RailLine>
  )
}

/**
 * The setup wizard, for both the first run (no config yet) and a re-run via `kaja config wizard`. Every step opens on
 * the current value, so holding Enter walks a configured machine through unchanged, and the last answer finishes it
 * with no confirmation. Escape on a list cancels the whole wizard; Backspace/Delete don't, unlike other
 * {@link SelectMenu}s, since a typo-fixing reflex shouldn't throw every answer away. Nothing is written here: the caller
 * applies the collected {@link WizardResult} once `onDone` fires.
 */
export function ConfigWizard({
  prefill,
  mode,
  saved,
  listModels,
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  /** Mode already forced by `--cloud`/`--local`; the mode step is skipped when set. */
  mode?: KajaMode
  /** Secrets already on disk, so their step offers to keep them instead of demanding a new one. */
  saved?: WizardSaved
  /**
   * The model ids the custom provider's server lists, offered instead of typing one. `key` is the one just typed,
   * if any. Without it, or when the server lists none, model ids are typed.
   */
  listModels?: (baseUrl: string, provider: string, key?: string) => Promise<string[]>
  onDone: (result: WizardResult) => void
  onCancel: () => void
}>) {
  const initial: WizardResult = { ...prefill, ...(mode ? { mode } : {}) }
  // Language is always first and never skipped: every question after it is only answerable by
  // someone who can read it.
  const [step, setStep] = useState<Step>("language")
  const [result, setResult] = useState<WizardResult>(initial)
  // Append-only: <Static> prints each item once and leaves it in the scrollback.
  const [answered, setAnswered] = useState<TrailItem[]>([{ id: "header" }])
  // Set when Enter was pressed on the providers checklist with nothing ticked.
  const [noProvider, setNoProvider] = useState(false)
  // The theme the wizard is drawn in: follows the highlight on the theme step, so moving it recolours everything at once
  const [preview, setPreview] = useState<ThemeName>(initial.theme ?? "dark")
  // The custom server's model ids, per address; `ids` is unset while it is being asked
  const [probe, setProbe] = useState<{ url: string; ids?: string[] }>()
  // The user chose to type a model id rather than pick a listed one
  const [typing, setTyping] = useState(false)

  // Asks the custom server for its models once its address and key are in, on the first model step
  const probeUrl = step.startsWith("custom-model") ? result.custom?.baseUrl : undefined
  const probedUrl = useRef<string>(undefined)
  useEffect(() => {
    if (!probeUrl || !listModels || probedUrl.current === probeUrl) return
    probedUrl.current = probeUrl
    setProbe({ url: probeUrl })
    const name = result.custom?.name ?? ""
    void listModels(probeUrl, name, result.keys?.[name] || undefined).then(ids => {
      if (probedUrl.current === probeUrl) setProbe({ url: probeUrl, ids })
    })
  }, [probeUrl, listModels, result.custom?.name, result.keys])

  // The last answer finishes it: every answer is already on screen, and there's no step to go back to.
  const finished = useRef(false)
  useEffect(() => {
    if (step !== "done" || finished.current) return
    finished.current = true
    onDone(result)
  }, [step, result, onDone])

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    const line = answerLine(step, next, saved)
    if (line) setAnswered(list => [...list, { id: step, ...line }])
    setResult(next)
    setTyping(false)
    setStep(nextStepAfter(step, next, mode))
  }

  function stepView() {
    const [kind, subject] = step.split(":") as [string, string | undefined]
    return providerStepView(kind, subject) ?? customStepView(kind, subject) ?? fixedStepView()
  }

  // A catalog provider's key and address, and the model picked for a task.
  function providerStepView(kind: string, subject: string | undefined) {
    const provider = subject ? catalogProvider(subject) : undefined

    if (kind === "key" && provider) {
      return (
        <InputPrompt
          secret
          title={t("wizard.providerKeyTitle", { provider: provider.name })}
          hint={t(saved?.providers?.includes(provider.id) ? "wizard.keyHintSaved" : "wizard.keyHint")}
          onSubmit={value => advance({ keys: { ...result.keys, [provider.id]: value } })}
        />
      )
    }

    if (kind === "address" && provider) {
      return (
        <InputPrompt
          title={t("wizard.baseUrlTitle", { provider: provider.name })}
          hint={t("wizard.baseUrlHint")}
          defaultValue={result.addresses?.[provider.id] ?? provider.baseUrl}
          onSubmit={value => advance({ addresses: { ...result.addresses, [provider.id]: value || provider.baseUrl } })}
        />
      )
    }

    if (kind === "model") {
      const task = subject as ModelTask
      const candidates = candidatesByTask(chosenProviders(result))[task] ?? []
      const current = candidates.findIndex(candidate => candidate.provider === result.models?.[task])
      return (
        <Question title={t("wizard.modelTitle", { task: t(TASK_LABEL_KEY[task]) })}>
          <SelectMenu
            closeOnBackspace={false}
            items={candidates.map(candidate => `${providerName(candidate.provider)} — ${candidate.model}`)}
            width={70}
            initialIndex={current >= 0 ? current : undefined}
            onSelect={index => advance({ models: { ...result.models, [task]: candidates[index]!.provider } })}
            onClose={onCancel}
          />
          <Text dimColor>{t("wizard.modelHint")}</Text>
        </Question>
      )
    }

    return undefined
  }

  // The custom OpenAI-compatible provider: its name, address, key, and each model with its task.
  function customStepView(kind: string, subject: string | undefined) {
    const custom = result.custom ?? { models: [] }
    const nameOf = custom.name ?? ""

    if (step === "custom-name") {
      return (
        <InputPrompt
          title={t("wizard.customNameTitle")}
          hint={t("wizard.customNameHint")}
          defaultValue={custom.name}
          validate={value => (customId(value) ? undefined : t("wizard.customNameInvalid"))}
          onSubmit={value => advance({ custom: { ...custom, name: customId(value) } })}
        />
      )
    }

    if (step === "custom-url") {
      return (
        <InputPrompt
          title={t("wizard.customUrlTitle")}
          hint={t("wizard.customUrlHint")}
          defaultValue={custom.baseUrl}
          validate={value => (isWebAddress(value) ? undefined : t("wizard.customUrlInvalid"))}
          onSubmit={value => advance({ custom: { ...custom, baseUrl: value } })}
        />
      )
    }

    if (step === "custom-key") {
      return (
        <InputPrompt
          secret
          title={t("wizard.providerKeyTitle", { provider: nameOf })}
          hint={t(saved?.providers?.includes(nameOf) ? "wizard.keyHintSaved" : "wizard.keyHint")}
          onSubmit={value => advance({ keys: { ...result.keys, [nameOf]: value } })}
        />
      )
    }

    if (kind === "custom-model") {
      const index = Number(subject)
      // A model the wizard is re-offering opens on its id; one past the end is a new one, and empty ends the list.
      const existing = custom.models[index]
      const listed = probe?.url === custom.baseUrl ? probe : undefined
      if (!existing && !typing && listed && !listed.ids) {
        return <Text dimColor>{t("wizard.customModelSearching", { url: custom.baseUrl ?? "" })}</Text>
      }
      const offered = (listed?.ids ?? []).filter(id => !custom.models.some(entry => entry.model === id))
      if (!existing && !typing && offered.length > 0) {
        // Typing and finishing first, so they stay in reach above a long list
        const actions = [t("wizard.customModelTypeOther"), ...(index > 0 ? [t("wizard.customModelEnough")] : [])]
        return (
          <Question
            title={t(index === 0 ? "wizard.customModelPickTitle" : "wizard.customModelPickMoreTitle", {
              provider: nameOf
            })}
          >
            <SelectMenu
              closeOnBackspace={false}
              items={[...actions, ...offered]}
              width={70}
              initialIndex={actions.length}
              onSelect={choice => {
                if (choice === 0) return setTyping(true)
                if (choice < actions.length) return advance({ custom: { ...custom, done: true } })
                advance({
                  custom: { ...custom, models: [...custom.models, { model: offered[choice - actions.length]! }] }
                })
              }}
              onClose={onCancel}
            />
          </Question>
        )
      }
      return (
        <InputPrompt
          title={t(index === 0 || existing ? "wizard.customModelTitle" : "wizard.customModelMoreTitle", {
            provider: nameOf
          })}
          hint={t("wizard.customModelHint")}
          defaultValue={existing?.model}
          // The first model is required, or the provider would serve nothing.
          validate={value => (!existing && index === 0 && !value ? t("wizard.customModelRequired") : undefined)}
          onSubmit={value => {
            if (existing) {
              const models = custom.models.map((m, i) => (i === index && value ? { ...m, model: value } : m))
              return advance({ custom: { ...custom, models } })
            }
            advance({
              custom: value ? { ...custom, models: [...custom.models, { model: value }] } : { ...custom, done: true }
            })
          }}
        />
      )
    }

    if (kind === "custom-task") {
      const index = Number(subject)
      const entry = custom.models[index]
      return (
        <Question title={t("wizard.customTaskTitle", { model: entry?.model ?? "" })}>
          <SelectMenu
            closeOnBackspace={false}
            items={TASK_ORDER.map(task => t(TASK_LABEL_KEY[task]))}
            width={70}
            initialIndex={entry?.task ? TASK_ORDER.indexOf(entry.task) : undefined}
            onSelect={choice =>
              advance({
                custom: {
                  ...custom,
                  models: custom.models.map((m, i) => (i === index ? { ...m, task: TASK_ORDER[choice]! } : m))
                }
              })
            }
            onClose={onCancel}
          />
        </Question>
      )
    }

    return undefined
  }

  // The steps asked once: language, theme, mode, providers, extras and the Telegram token.
  function fixedStepView() {
    switch (step) {
      case "mode": {
        return (
          <Question title={t("wizard.modeTitle")}>
            <SelectMenu
              closeOnBackspace={false}
              items={[t("wizard.modeCloud"), t("wizard.modeLocal")]}
              width={70}
              initialIndex={Math.max(0, MODE_CHOICES.indexOf(result.mode ?? "cloud"))}
              onSelect={index => advance({ mode: MODE_CHOICES[index] })}
              onClose={onCancel}
            />
          </Question>
        )
      }

      case "language": {
        return (
          <Question title={t("wizard.languageTitle")}>
            <SelectMenu
              closeOnBackspace={false}
              items={locales.map(locale => LOCALE_LABELS[locale])}
              // The code beside the native name, so a language you can't read is still identifiable.
              hints={[...locales]}
              initialIndex={result.language ? locales.indexOf(result.language) : undefined}
              onSelect={index => {
                const language = locales[index]!
                // Switching the process language here is the whole point of asking first: every step
                // after this one renders through `t()`. The caller still saves it to preferences.locale.
                setLanguage(language)
                advance({ language })
              }}
              onClose={onCancel}
            />
          </Question>
        )
      }

      case "theme": {
        return (
          <Question title={t("wizard.themeTitle")}>
            <SelectMenu
              closeOnBackspace={false}
              items={THEME_CHOICES.map(choice => t(THEME_LABEL_KEY[choice]))}
              width={70}
              initialIndex={THEME_CHOICES.indexOf(result.theme ?? "dark")}
              // The highlighted row in that theme's own colours, and the whole wizard with it
              preview
              onFocus={index => setPreview(THEME_CHOICES[index]!)}
              onSelect={index => advance({ theme: THEME_CHOICES[index] })}
              onClose={onCancel}
            />
            <Text dimColor>{t("wizard.themeHint")}</Text>
          </Question>
        )
      }

      case "providers": {
        return (
          <Question title={t("wizard.providerTitle")}>
            {/* A re-run starts with the providers in models.toml ticked; a first run with none, and Enter won't continue until one is. */}
            <CheckMenu
              options={[
                ...CATALOG.map(provider => ({
                  label: t(provider.kind === "hosted" ? "wizard.providerHosted" : "wizard.providerSelfHosted", {
                    name: provider.name
                  }),
                  value: provider.id
                })),
                { label: t("wizard.providerCustom"), value: CUSTOM }
              ]}
              defaultValue={result.providers}
              onSubmit={providers => {
                setNoProvider(providers.length === 0)
                if (providers.length > 0) advance({ providers })
              }}
              onClose={onCancel}
            />
            {noProvider ? (
              <Problem>{t("wizard.providerRequired")}</Problem>
            ) : (
              <Text dimColor>{t("wizard.providerHint")}</Text>
            )}
          </Question>
        )
      }

      case "extras": {
        return (
          <Question title={t("wizard.extrasTitle")}>
            {/* Nothing ticked by default, so one Enter skips the whole step. */}
            <CheckMenu
              options={EXTRA_CHOICES.map(extra => ({ label: t(EXTRA_LABEL_KEY[extra]), value: extra }))}
              defaultValue={result.extras}
              onSubmit={values => advance({ extras: values as WizardExtra[] })}
              onClose={onCancel}
            />
            <Text dimColor>{t("wizard.extrasHint")}</Text>
          </Question>
        )
      }

      case "telegramToken": {
        return (
          <InputPrompt
            secret
            title={t("wizard.telegramTokenTitle")}
            hint={t(saved?.telegram ? "wizard.keyHintSaved" : "wizard.keyHint")}
            onSubmit={telegramToken => advance({ telegramToken })}
          />
        )
      }

      default:
        // Nothing to draw: the answers are on screen, and the setup carries on below once onDone fires.
        return null
    }
  }

  return (
    <ThemeProvider theme={themeFor(preview)}>
      <Box flexDirection="column">
        <Static items={answered}>
          {item =>
            "label" in item ? (
              <Answered key={item.id} label={`${item.label}:`} value={item.value} />
            ) : (
              <Header key={item.id} />
            )
          }
        </Static>
        {/* Keyed by step: two questions of one kind in a row (two addresses, two keys) must not share an input's state. */}
        <Box key={step} flexDirection="column">
          {stepView()}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
