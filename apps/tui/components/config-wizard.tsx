import { MultiSelect, PasswordInput, TextInput } from "@inkjs/ui"
import type { ModelTask } from "@kaja/schema/config"
import { capitalized, LOCALE_LABELS, locales } from "@kaja/shared"
import { Box, Static, Text, useInput } from "ink"
import { useState } from "react"
import type { KajaMode } from "../lib/config/mode"
import type { Language } from "../lib/i18n"
import { setLanguage, t } from "../lib/i18n"
import { CATALOG, type CatalogProvider, candidatesByTask, catalogProvider, TASK_ORDER } from "../lib/models/catalog"
import { listPaths } from "../lib/paths"
import { SelectMenu } from "./elem/select-menu"

/** Optional features, each needing one more answer afterwards. None is ticked by default. */
export type WizardExtra = "webSearch" | "telegram"

const EXTRA_CHOICES: WizardExtra[] = ["webSearch", "telegram"]

const EXTRA_LABEL_KEY: Record<WizardExtra, string> = {
  webSearch: "wizard.extraWebSearch",
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
export type WizardResult = {
  mode?: KajaMode
  language?: Language
  /** The ticked catalog providers, in catalog order. Empty means the user sets up models.toml themselves. */
  providers?: string[]
  /** Typed API keys by provider id; only hosted providers are asked. */
  keys?: Record<string, string>
  /** Where each local provider's server listens. */
  addresses?: Record<string, string>
  /** The provider that serves each task more than one ticked provider could. */
  models?: Partial<Record<ModelTask, string>>
  extras?: WizardExtra[]
  webSearchKey?: string
  telegramToken?: string
}

/** Which secrets are already in secrets.toml, so their step can offer to keep what's there. */
export type WizardSaved = {
  /** Provider names with an `api_key` already saved — a list, since the step can pick any of them. */
  providers?: string[]
  webSearch?: boolean
  telegram?: boolean
}

/**
 * One question. The key, address and model steps repeat, so they carry what they are about:
 * `key:fireworks`, `address:ollama`, `model:chat`.
 */
type Step =
  | "mode"
  | "language"
  | "providers"
  | `key:${string}`
  | `address:${string}`
  | `model:${ModelTask}`
  | "extras"
  | "webSearchKey"
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
  stt: "wizard.taskStt"
}

const MODE_CHOICES: KajaMode[] = ["cloud", "local"]

/** The ticked providers as catalog entries, in catalog order. */
function chosenProviders(result: WizardResult): CatalogProvider[] {
  return CATALOG.filter(provider => result.providers?.includes(provider.id))
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
  const steps: Step[] = forcedMode === undefined ? ["language", "mode"] : ["language"]
  if (result.mode === "cloud") return [...steps, "summary"]

  steps.push("providers")
  for (const provider of chosenProviders(result)) {
    steps.push(provider.kind === "hosted" ? `key:${provider.id}` : `address:${provider.id}`)
  }
  for (const task of contestedTasks(result)) steps.push(`model:${task}`)
  // Every extra is a local-agent feature: the Telegram bot and the web_search tool.
  steps.push("extras")
  if (result.extras?.includes("webSearch")) steps.push("webSearchKey")
  if (result.extras?.includes("telegram")) steps.push("telegramToken")
  steps.push("summary")
  return steps
}

function nextStepAfter(step: Step, result: WizardResult, forcedMode?: KajaMode): Step {
  const steps = stepsFor(result, forcedMode)
  return steps[steps.indexOf(step) + 1] ?? "summary"
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
  onSubmit
}: Readonly<{
  title: string
  hint: string
  secret?: boolean
  defaultValue?: string
  onSubmit: (value: string) => void
}>) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text>{title}</Text>
      <Box borderStyle="classic" width={70} borderColor="magenta" paddingLeft={1}>
        {secret ? (
          <PasswordInput placeholder={t("secretPrompt.placeholder")} onSubmit={value => onSubmit(value.trim())} />
        ) : (
          <TextInput defaultValue={defaultValue} onSubmit={value => onSubmit(value.trim())} />
        )}
      </Box>
      <Text dimColor>{hint}</Text>
    </Box>
  )
}

function providerName(id: string): string {
  return catalogProvider(id)?.name ?? id
}

/** What happened to a key step: typed, left empty over one already saved, or left empty. Undefined when the step never applied. */
function keyState(typed: string | undefined, alreadySaved: boolean | undefined): string | undefined {
  if (typed === undefined) return undefined
  if (typed) return t("wizard.keyStateEntered")
  return t(alreadySaved ? "wizard.keyStateKept" : "wizard.keyStateSkipped")
}

/** One answered step, kept on screen above the next question. */
type Answer = { id: string; label: string; value: string }

/**
 * The line a finished step leaves behind. Never a key's value, only what became of it. A step that
 * recorded nothing (no extras ticked) leaves no line.
 */
function answerLine(
  step: Step,
  result: WizardResult,
  saved?: WizardSaved
): Pick<Answer, "label" | "value"> | undefined {
  const [kind, subject] = step.split(":") as [string, string | undefined]
  switch (kind) {
    case "language":
      return result.language ? { label: t("wizard.summaryLanguage"), value: LOCALE_LABELS[result.language] } : undefined
    case "mode":
      return result.mode
        ? {
            label: t("wizard.summaryMode"),
            value: t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")
          }
        : undefined
    case "providers":
      return {
        label: t("wizard.summaryProvider"),
        value: result.providers?.length ? result.providers.map(providerName).join(", ") : t("wizard.providersNone")
      }
    case "key": {
      const value = keyState(result.keys?.[subject!], saved?.providers?.includes(subject!))
      return value ? { label: t("wizard.summaryKeyProvider", { provider: providerName(subject!) }), value } : undefined
    }
    case "address": {
      const value = result.addresses?.[subject!]
      return value ? { label: t("wizard.summaryAddress", { provider: providerName(subject!) }), value } : undefined
    }
    case "model": {
      const task = subject as ModelTask
      const picked = candidatesByTask(chosenProviders(result))[task]?.find(c => c.provider === result.models?.[task])
      return picked
        ? {
            label: capitalized(t("wizard.summaryModel", { task: t(TASK_LABEL_KEY[task]) })),
            value: `${providerName(picked.provider)} (${picked.model})`
          }
        : undefined
    }
    case "extras":
      return result.extras?.length
        ? { label: t("wizard.summaryExtras"), value: result.extras.map(e => t(EXTRA_LABEL_KEY[e])).join(", ") }
        : undefined
    case "webSearchKey": {
      const value = keyState(result.webSearchKey, saved?.webSearch)
      return value ? { label: t("wizard.summaryKeyWebSearch"), value } : undefined
    }
    case "telegramToken": {
      const value = keyState(result.telegramToken, saved?.telegram)
      return value ? { label: t("wizard.summaryKeyTelegram"), value } : undefined
    }
    default:
      return undefined
  }
}

/** One answered step, dimmed: the wizard's trail, so each question is a step forward and not a replacement. */
function AnswerRow({ label, value }: Readonly<Pick<Answer, "label" | "value">>) {
  return (
    <Text dimColor>
      ✓ {label}: <Text color="green">{value}</Text>
    </Text>
  )
}

/** The last screen. The answers are already on screen above, so this only says where it all goes. */
function SummaryStep({ result }: Readonly<{ result: WizardResult }>) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text>{t("wizard.summaryTitle")}</Text>
      <Box flexDirection="column">
        <Text dimColor>{t("wizard.summaryPaths")}</Text>
        {listPaths(result.mode === "local").map(({ label, path }) => (
          <Text key={path} dimColor>
            {"  "}
            {label}: {path}
          </Text>
        ))}
      </Box>
      <Text dimColor>{t(result.mode === "cloud" ? "wizard.summaryHintCloud" : "wizard.summaryHint")}</Text>
    </Box>
  )
}

/**
 * The setup wizard, for both the first run (no config yet) and a re-run via `kaja config wizard`.
 * Every step opens on the current value, so holding Enter walks a configured machine through unchanged.
 * Escape/backspace/delete at any step cancels the whole wizard, the same dismissal contract as
 * {@link SelectMenu}. Nothing is written here — the caller applies the collected {@link WizardResult}
 * once `onDone` fires, via the existing config/secrets writers.
 */
export function ConfigWizard({
  prefill,
  mode,
  saved,
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  /** Mode already forced by `--cloud`/`--local`; the mode step is skipped when set. */
  mode?: KajaMode
  /** Secrets already on disk, so their step offers to keep them instead of demanding a new one. */
  saved?: WizardSaved
  onDone: (result: WizardResult) => void
  onCancel: () => void
}>) {
  const initial: WizardResult = { ...prefill, ...(mode ? { mode } : {}) }
  // Language is always first and never skipped: every question after it is only answerable by
  // someone who can read it.
  const [step, setStep] = useState<Step>("language")
  const [result, setResult] = useState<WizardResult>(initial)
  // Append-only: <Static> prints each item once and leaves it in the scrollback.
  const [answered, setAnswered] = useState<Answer[]>([])

  useInput((_input, key) => {
    if (step === "summary" && (key.return || key.escape)) onDone(result)
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
        <Box flexDirection="column" gap={1}>
          <Text>{t("wizard.modelTitle", { task: t(TASK_LABEL_KEY[task]) })}</Text>
          <SelectMenu
            items={candidates.map(candidate => `${providerName(candidate.provider)} — ${candidate.model}`)}
            width={70}
            initialIndex={current >= 0 ? current : undefined}
            onSelect={index => advance({ models: { ...result.models, [task]: candidates[index]!.provider } })}
            onClose={onCancel}
          />
          <Text dimColor>{t("wizard.modelHint")}</Text>
        </Box>
      )
    }

    switch (step) {
      case "mode": {
        return (
          <Box flexDirection="column" gap={1}>
            <Text>{t("wizard.modeTitle")}</Text>
            <SelectMenu
              items={[t("wizard.modeCloud"), t("wizard.modeLocal")]}
              width={70}
              initialIndex={Math.max(0, MODE_CHOICES.indexOf(result.mode ?? "cloud"))}
              onSelect={index => advance({ mode: MODE_CHOICES[index] })}
              onClose={onCancel}
            />
          </Box>
        )
      }

      case "language": {
        return (
          <Box flexDirection="column" gap={1}>
            <Text>{t("wizard.languageTitle")}</Text>
            <SelectMenu
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
          </Box>
        )
      }

      case "providers": {
        return (
          <Box flexDirection="column" gap={1}>
            <Text>{t("wizard.providerTitle")}</Text>
            <Box borderStyle="classic" width={70} borderColor="magenta" paddingLeft={1}>
              {/* Nothing ticked by default, so one Enter means "I'll set up models.toml myself". */}
              <MultiSelect
                options={CATALOG.map(provider => ({
                  label: t(PROVIDER_LABEL_KEY[provider.id] ?? provider.id),
                  value: provider.id
                }))}
                defaultValue={result.providers}
                onSubmit={values => advance({ providers: CATALOG.map(p => p.id).filter(id => values.includes(id)) })}
              />
            </Box>
            <Text dimColor>{t("wizard.providerHint")}</Text>
          </Box>
        )
      }

      case "extras": {
        return (
          <Box flexDirection="column" gap={1}>
            <Text>{t("wizard.extrasTitle")}</Text>
            <Box borderStyle="classic" width={70} borderColor="magenta" paddingLeft={1}>
              {/* Nothing ticked by default, so one Enter skips the whole step. */}
              <MultiSelect
                options={EXTRA_CHOICES.map(extra => ({ label: t(EXTRA_LABEL_KEY[extra]), value: extra }))}
                defaultValue={result.extras}
                onSubmit={values => advance({ extras: values as WizardExtra[] })}
              />
            </Box>
            <Text dimColor>{t("wizard.extrasHint")}</Text>
          </Box>
        )
      }

      case "webSearchKey": {
        return (
          <InputStep
            secret
            title={t("wizard.webSearchKeyTitle")}
            hint={t(saved?.webSearch ? "wizard.keyHintSaved" : "wizard.keyHint")}
            onSubmit={webSearchKey => advance({ webSearchKey })}
          />
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
        return <SummaryStep result={result} />
    }
  }

  return (
    <Box flexDirection="column">
      <Static items={answered}>
        {answer => <AnswerRow key={answer.id} label={answer.label} value={answer.value} />}
      </Static>
      {/* Keyed by step: two questions of one kind in a row (two addresses, two keys) must not share an input's state. */}
      <Box key={step} marginTop={1} flexDirection="column">
        {stepView()}
      </Box>
    </Box>
  )
}
