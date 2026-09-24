import { MultiSelect, PasswordInput, TextInput, ThemeProvider } from "@inkjs/ui"
import type { ModelTask } from "@kaja/schema/config"
import { capitalized, LOCALE_LABELS, locales } from "@kaja/shared"
import { Box, Static, Text, useInput } from "ink"
import Gradient from "ink-gradient"
import { useState } from "react"
import type { KajaMode } from "../lib/config/mode"
import type { Language } from "../lib/i18n"
import { setLanguage, t } from "../lib/i18n"
import { CATALOG, type CatalogProvider, candidatesByTask, catalogProvider, TASK_ORDER } from "../lib/models/catalog"
import type { Brightness } from "../lib/terminal-background"
import { Answered, InputFrame, Question, RailLine } from "./elem/rail"
import { SelectMenu } from "./elem/select-menu"
import { themes, useKajaTheme, usePalette } from "./theme"

/** Optional features, each needing one more answer afterwards. None is ticked by default. */
export type WizardExtra = "telegram"

const EXTRA_CHOICES: WizardExtra[] = ["telegram"]

const EXTRA_LABEL_KEY: Record<WizardExtra, string> = {
  telegram: "wizard.extraTelegram"
}

/**
 * Everything the wizard collects. The typed-in values below are asked for here rather than by the
 * credential pass afterwards, so a key is typed while its question is still on screen — but nothing
 * is written here: the caller hands them to that pass, which tests each one before saving it.
 *
 * `""` means the step was shown and skipped, `undefined` that it never applied. The caller needs
 * both: a key the user has already declined must not be asked for a second time.
 */
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

export type WizardResult = {
  mode?: KajaMode
  language?: Language
  /** Prefilled with the saved theme, else the one detected from the terminal's background. */
  theme?: Brightness
  /** The ticked catalog providers, in catalog order, and `custom` last when that was ticked. Never empty once asked: local mode can't start without one. */
  providers?: string[]
  custom?: WizardCustom
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
 * One question. The key, address and model steps repeat, so they carry what they are about:
 * `key:fireworks`, `address:ollama`, `model:chat`.
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
  | "summary"

const PROVIDER_LABEL_KEY: Record<string, string> = {
  fireworks: "wizard.providerFireworks",
  xai: "wizard.providerXai",
  ollama: "wizard.providerOllama",
  llama: "wizard.providerLlama",
  speaches: "wizard.providerSpeaches"
}

const TASK_LABEL_KEY: Record<ModelTask, string> = {
  chat: "wizard.taskChat",
  embedding: "wizard.taskEmbedding",
  rerank: "wizard.taskRerank",
  "image-generation": "wizard.taskImageGeneration",
  tts: "wizard.taskTts",
  stt: "wizard.taskStt",
  summarize: "wizard.taskSummarize"
}

const MODE_CHOICES: KajaMode[] = ["cloud", "local"]

const THEME_CHOICES: Brightness[] = ["dark", "light"]

const THEME_LABEL_KEY: Record<Brightness, string> = {
  dark: "wizard.themeDark",
  light: "wizard.themeLight"
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

/** The custom provider as a catalog entry, once it has an address and at least one model with its task. */
function customProvider(result: WizardResult): CatalogProvider | undefined {
  const custom = result.custom
  if (!result.providers?.includes(CUSTOM) || !custom?.name || !custom.baseUrl) return undefined
  const models = custom.models.flatMap(({ model, task }) => (task ? [{ model, task }] : []))
  if (models.length === 0) return undefined
  return { id: custom.name, name: custom.name, kind: "hosted", baseUrl: custom.baseUrl, models }
}

/** The ticked providers from the catalog, in catalog order. */
function catalogChoices(result: WizardResult): CatalogProvider[] {
  return CATALOG.filter(provider => result.providers?.includes(provider.id))
}

/** Every ticked provider, the custom one last. Exported for the runner, which writes models.toml from it. */
export function chosenProviders(result: WizardResult): CatalogProvider[] {
  const custom = customProvider(result)
  return custom ? [...catalogChoices(result), custom] : catalogChoices(result)
}

/** The tasks more than one ticked provider can serve: the only model questions worth asking. */
function contestedTasks(result: WizardResult): ModelTask[] {
  const candidates = candidatesByTask(chosenProviders(result))
  return TASK_ORDER.filter(task => (candidates[task]?.length ?? 0) > 1)
}

/**
 * Every question this set of answers leads to, in order. Cloud needs no provider; a hosted provider
 * is asked for a key and a local one for an address; a model is asked about only where the ticked
 * providers overlap; and each extra's follow-up only when that extra was ticked. Recomputed after
 * every answer, so a skipped step never mounts just to advance out of itself.
 */
function stepsFor(result: WizardResult, forcedMode?: KajaMode): Step[] {
  // `--cloud`/`--local` already answered the mode. A prefilled mode does not: that's the current
  // setting being re-offered, which the user is here to change.
  const steps: Step[] = forcedMode === undefined ? ["language", "theme", "mode"] : ["language", "theme"]
  if (result.mode === "cloud") return [...steps, "summary"]

  steps.push("providers")
  for (const provider of catalogChoices(result)) {
    steps.push(provider.kind === "hosted" ? `key:${provider.id}` : `address:${provider.id}`)
  }
  if (result.providers?.includes(CUSTOM)) {
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
  steps.push("summary")
  return steps
}

function nextStepAfter(step: Step, result: WizardResult, forcedMode?: KajaMode): Step {
  const steps = stepsFor(result, forcedMode)
  const at = steps.indexOf(step)
  if (at !== -1) return steps[at + 1] ?? "summary"
  // The step that just ended the custom model list is no longer in the list, so carry on after the custom ones.
  const lastCustom = steps.findLastIndex(candidate => candidate.startsWith("custom"))
  return steps[lastCustom + 1] ?? "summary"
}

/**
 * One typed answer: an address, an account id, or a key. A key is masked and never prefilled —
 * `saved` only says whether there is one to keep. Submitting nothing skips the step, which the
 * caller reads as "asked and declined" rather than "never asked".
 */
function InputStep({
  title,
  hint,
  secret,
  defaultValue,
  validate,
  onSubmit
}: Readonly<{
  title: string
  hint: string
  secret?: boolean
  defaultValue?: string
  /** Says what is wrong with an answer, or nothing when it is fine. A wrong answer keeps the question open. */
  validate?: (value: string) => string | undefined
  onSubmit: (value: string) => void
}>) {
  const [problem, setProblem] = useState<string>()
  const submit = (raw: string) => {
    const value = raw.trim()
    const complaint = validate?.(value)
    setProblem(complaint)
    if (!complaint) onSubmit(value)
  }
  return (
    <Question title={title}>
      <InputFrame>
        {secret ? (
          <PasswordInput placeholder={t("secretPrompt.placeholder")} onSubmit={submit} />
        ) : (
          <TextInput defaultValue={defaultValue} onSubmit={submit} />
        )}
      </InputFrame>
      {problem ? <Problem>{problem}</Problem> : <Text dimColor>{hint}</Text>}
    </Question>
  )
}

function providerName(id: string): string {
  return catalogProvider(id)?.name ?? (id === CUSTOM ? "Custom" : id)
}

/** What happened to a key step: typed, left empty over one already saved, or left empty. Undefined when the step never applied. */
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
 * The line a finished step leaves behind. Never a key's value, only what became of it. A step that
 * recorded nothing (no extras ticked) leaves no line.
 */
function answerLine(step: Step, result: WizardResult, saved?: WizardSaved): AnswerLine {
  const [kind, subject = ""] = step.split(":") as [string, string | undefined]
  return ANSWER_LINES[kind]?.(subject, result, saved)
}

/** Why Enter didn't move on. */
function Problem({ children }: Readonly<{ children: string }>) {
  const { danger } = useKajaTheme()
  return <Text {...danger()}>{children}</Text>
}

/** The trail's first line: the mascot and the name, in the theme's gradient. */
function Header() {
  const { gradient } = usePalette()
  return (
    <RailLine marker={<Text dimColor>┌</Text>}>
      <Gradient colors={gradient}>
        <Text bold>༼☉ɷ⊙༽ kaja</Text>
      </Gradient>
    </RailLine>
  )
}

/** A few lines drawn in the highlighted theme's colours, so the choice is made by looking rather than guessing. */
function ThemePreview() {
  const { inputBox, userText, muted } = useKajaTheme()
  return (
    <Box flexDirection="column" width={70}>
      <Text {...userText()}>{`> ${t("wizard.themePreviewUser")}`}</Text>
      <Text {...muted()}>{t("wizard.themePreviewMuted")}</Text>
      <Box {...inputBox()} borderStyle="classic" paddingLeft={1}>
        <Text>{t("wizard.themePreviewInput")}</Text>
      </Box>
    </Box>
  )
}

// What happens after Enter: on the first run Kaja carries straight on into the chat (or the cloud sign-in)
function summaryHintKey(cloud: boolean, firstRun?: boolean): string {
  if (firstRun) return cloud ? "wizard.summaryHintFirstRunCloud" : "wizard.summaryHintFirstRun"
  return cloud ? "wizard.summaryHintCloud" : "wizard.summaryHint"
}

/** The last screen. The answers are already on screen above, so this only says what to do next. */
function SummaryStep({ result, firstRun }: Readonly<{ result: WizardResult; firstRun?: boolean }>) {
  const { success } = useKajaTheme()
  return (
    <Box flexDirection="column">
      <Text dimColor>│</Text>
      <RailLine marker={<Text {...success()}>└</Text>}>
        <Text bold {...success()}>
          {t("wizard.summaryTitle")}
        </Text>
      </RailLine>
      <Box paddingLeft={3}>
        <Text dimColor>{t(summaryHintKey(result.mode === "cloud", firstRun))}</Text>
      </Box>
    </Box>
  )
}

/**
 * The setup wizard, for both the first run (no config yet) and a re-run via `kaja config wizard`.
 * Every step opens on the current value, so holding Enter walks a configured machine through unchanged.
 * Escape on a list cancels the whole wizard. Backspace/Delete don't, unlike other {@link SelectMenu}s: a
 * typo-fixing reflex shouldn't throw every answer away. Nothing is written here — the caller applies the collected {@link WizardResult}
 * once `onDone` fires, via the existing config/secrets writers.
 */
export function ConfigWizard({
  prefill,
  mode,
  saved,
  firstRun,
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  /** Mode already forced by `--cloud`/`--local`; the mode step is skipped when set. */
  mode?: KajaMode
  /** Secrets already on disk, so their step offers to keep them instead of demanding a new one. */
  saved?: WizardSaved
  /** Launched by a plain `kaja` with no config yet, which goes on into the chat afterwards. */
  firstRun?: boolean
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
  const [preview, setPreview] = useState<Brightness>(initial.theme ?? "dark")

  useInput((_input, key) => {
    if (step === "summary" && key.return) onDone(result)
    else if (step === "summary" && key.escape) onCancel()
    // MultiSelect has no dismissal of its own, so its steps get the same Esc contract as SelectMenu.
    else if ((step === "providers" || step === "extras") && key.escape) onCancel()
  })

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    const line = answerLine(step, next, saved)
    if (line) setAnswered(list => [...list, { id: step, ...line }])
    setResult(next)
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
        <InputStep
          secret
          title={t("wizard.providerKeyTitle", { provider: provider.name })}
          hint={t(saved?.providers?.includes(provider.id) ? "wizard.keyHintSaved" : "wizard.keyHint")}
          onSubmit={value => advance({ keys: { ...result.keys, [provider.id]: value } })}
        />
      )
    }

    if (kind === "address" && provider) {
      return (
        <InputStep
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
        <InputStep
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
        <InputStep
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
        <InputStep
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
      return (
        <InputStep
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

  // The steps asked once: language, mode, providers, extras and their keys, then the summary.
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
          <Question title={t("wizard.languageTitle")} plain>
            <SelectMenu
              closeOnBackspace={false}
              items={locales.map(locale => LOCALE_LABELS[locale])}
              // The code beside the native name, so a language you can't read is still identifiable.
              hints={[...locales]}
              // Asked before the theme, so no colour at all: it has to read on any background
              plain
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
              onFocus={index => setPreview(THEME_CHOICES[index]!)}
              onSelect={index => advance({ theme: THEME_CHOICES[index] })}
              onClose={onCancel}
            />
            <ThemePreview />
            <Text dimColor>{t("wizard.themeHint")}</Text>
          </Question>
        )
      }

      case "providers": {
        return (
          <Question title={t("wizard.providerTitle")}>
            <InputFrame>
              {/* A re-run starts with the providers in models.toml ticked; a first run with none, and Enter won't continue until one is. */}
              <MultiSelect
                options={[
                  ...CATALOG.map(provider => ({
                    label: t(PROVIDER_LABEL_KEY[provider.id] ?? provider.id),
                    value: provider.id
                  })),
                  { label: t("wizard.providerCustom"), value: CUSTOM }
                ]}
                defaultValue={result.providers}
                onSubmit={values => {
                  const providers = [...CATALOG.map(p => p.id), CUSTOM].filter(id => values.includes(id))
                  setNoProvider(providers.length === 0)
                  if (providers.length > 0) advance({ providers })
                }}
              />
            </InputFrame>
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
            <InputFrame>
              {/* Nothing ticked by default, so one Enter skips the whole step. */}
              <MultiSelect
                options={EXTRA_CHOICES.map(extra => ({ label: t(EXTRA_LABEL_KEY[extra]), value: extra }))}
                defaultValue={result.extras}
                onSubmit={values => advance({ extras: values as WizardExtra[] })}
              />
            </InputFrame>
            <Text dimColor>{t("wizard.extrasHint")}</Text>
          </Question>
        )
      }

      case "telegramToken": {
        return (
          <InputStep
            secret
            title={t("wizard.telegramTokenTitle")}
            hint={t(saved?.telegram ? "wizard.keyHintSaved" : "wizard.keyHint")}
            onSubmit={telegramToken => advance({ telegramToken })}
          />
        )
      }

      default:
        return <SummaryStep result={result} firstRun={firstRun} />
    }
  }

  return (
    <ThemeProvider theme={themes[preview]}>
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
