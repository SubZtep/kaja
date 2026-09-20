import { MultiSelect, PasswordInput, TextInput } from "@inkjs/ui"
import { LOCALE_LABELS, locales } from "@kaja/shared"
import { Box, Text, useInput } from "ink"
import { useState } from "react"
import type { KajaMode } from "../lib/config/mode"
import type { Language } from "../lib/i18n"
import { setLanguage, t } from "../lib/i18n"
import { listPaths } from "../lib/paths"
import { SelectMenu } from "./elem/select-menu"

export type WizardProvider = "fireworks" | "ollama" | "llama" | "fetch" | "skip"

/** Optional features, each needing one more answer afterwards. None is ticked by default. */
export type WizardExtra = "webSearch" | "voice" | "telegram"

const EXTRA_CHOICES: WizardExtra[] = ["webSearch", "voice", "telegram"]

const EXTRA_LABEL_KEY: Record<WizardExtra, string> = {
  webSearch: "wizard.extraWebSearch",
  voice: "wizard.extraVoice",
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
  provider?: WizardProvider
  /** Where a local provider's server listens; only collected for the ones that run on this machine. */
  baseUrl?: string
  extras?: WizardExtra[]
  providerKey?: string
  webSearchKey?: string
  /** Speaches' address, for voice in and out. Not a secret — it goes to settings.toml. */
  voiceUrl?: string
  /** The one Telegram account the bot answers. Not a secret — it goes to services.toml. */
  telegramId?: string
  telegramToken?: string
}

/** Which secrets are already in secrets.toml, so their step can offer to keep what's there. */
export type WizardSaved = {
  /** Provider names with an `api_key` already saved — a list, since the step can pick any of them. */
  providers?: string[]
  webSearch?: boolean
  telegram?: boolean
}

type Step =
  | "mode"
  | "language"
  | "provider"
  | "providerKey"
  | "baseUrl"
  | "extras"
  | "webSearchKey"
  | "voiceUrl"
  | "telegramId"
  | "telegramToken"
  | "summary"

const STEP_ORDER: Step[] = [
  "language",
  "mode",
  "provider",
  "providerKey",
  "baseUrl",
  "extras",
  "webSearchKey",
  "voiceUrl",
  "telegramId",
  "telegramToken",
  "summary"
]

/** Providers whose follow-up question is an API key, not an address. "fetch" isn't known until fetched. */
const KEY_PROVIDERS: WizardProvider[] = ["fireworks"]

/** Speaches serves both speech-to-text and text-to-speech, so one URL configures voice in and out. */
const DEFAULT_SPEACHES_URL = "http://localhost:8000"

/** Providers that are a server on this machine: their setup question is an address, not a key. */
export const LOCAL_PROVIDER_URLS: Partial<Record<WizardProvider, string>> = {
  ollama: "http://localhost:11434/v1",
  llama: "http://localhost:8080/v1"
}

const MODE_CHOICES: KajaMode[] = ["cloud", "local"]

const PROVIDER_CHOICES: WizardProvider[] = ["fireworks", "ollama", "llama", "fetch", "skip"]

const PROVIDER_LABEL_KEY: Record<WizardProvider, string> = {
  fireworks: "wizard.providerFireworks",
  ollama: "wizard.providerOllama",
  llama: "wizard.providerLlama",
  fetch: "wizard.providerFetch",
  skip: "wizard.providerSkip"
}

/**
 * The step a completed one hands off to. Cloud needs no provider; only a provider that runs on this
 * machine is asked for an address, and only one that doesn't is asked for a key. Each extra's
 * follow-up is asked only when that extra was ticked. Resolved here rather than mid-render so a
 * skipped step never mounts just to advance out of itself.
 */
function nextStepAfter(step: Step, result: WizardResult, forcedMode?: KajaMode): Step {
  const cloud = result.mode === "cloud"
  const ticked = (extra: WizardExtra) => result.extras?.includes(extra) ?? false
  const last = STEP_ORDER.length - 1

  for (let index = STEP_ORDER.indexOf(step) + 1; index < last; index++) {
    const candidate = STEP_ORDER[index]!
    // `--cloud`/`--local` already answered this one. A prefilled mode does not: that's the current
    // setting being re-offered, which the user is here to change.
    if (candidate === "mode" && forcedMode) continue
    if (candidate === "provider" && cloud) continue
    if (candidate === "providerKey" && (cloud || !KEY_PROVIDERS.includes(result.provider!))) continue
    if (candidate === "baseUrl" && (cloud || !LOCAL_PROVIDER_URLS[result.provider!])) continue
    // Every extra is a local-agent feature: the Telegram bot, voice, and the web_search tool.
    if (candidate === "extras" && cloud) continue
    if (candidate === "webSearchKey" && !ticked("webSearch")) continue
    if (candidate === "voiceUrl" && !ticked("voice")) continue
    if ((candidate === "telegramId" || candidate === "telegramToken") && !ticked("telegram")) continue
    return candidate
  }
  return "summary"
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

/** One "label: value" line on the summary, or nothing when that step was skipped. */
function SummaryRow({ label, value }: Readonly<{ label: string; value?: string }>) {
  if (!value) return null
  return (
    <Text>
      {"  "}
      {label}: <Text color="green">{value}</Text>
    </Text>
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

  useInput((_input, key) => {
    if (step === "summary" && (key.return || key.escape)) onDone(result)
    // MultiSelect has no dismissal of its own, so the extras step gets the same Esc contract as SelectMenu.
    else if (step === "extras" && key.escape) onCancel()
  })

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    setResult(next)
    setStep(nextStepAfter(step, next, mode))
  }

  if (step === "mode") {
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

  if (step === "language") {
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

  if (step === "provider") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.providerTitle")}</Text>
        <SelectMenu
          items={PROVIDER_CHOICES.map(choice => t(PROVIDER_LABEL_KEY[choice]))}
          width={70}
          initialIndex={result.provider ? PROVIDER_CHOICES.indexOf(result.provider) : undefined}
          onSelect={index => advance({ provider: PROVIDER_CHOICES[index] })}
          onClose={onCancel}
        />
      </Box>
    )
  }

  if (step === "providerKey") {
    return (
      <InputStep
        secret
        title={t("wizard.providerKeyTitle", { provider: result.provider ?? "" })}
        hint={t(saved?.providers?.includes(result.provider ?? "") ? "wizard.keyHintSaved" : "wizard.keyHint")}
        onSubmit={providerKey => advance({ providerKey })}
      />
    )
  }

  if (step === "baseUrl") {
    const fallback = LOCAL_PROVIDER_URLS[result.provider!] ?? ""
    return (
      <InputStep
        title={t("wizard.baseUrlTitle")}
        hint={t("wizard.baseUrlHint")}
        defaultValue={result.baseUrl ?? fallback}
        onSubmit={value => advance({ baseUrl: value || fallback })}
      />
    )
  }

  if (step === "extras") {
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

  if (step === "webSearchKey") {
    return (
      <InputStep
        secret
        title={t("wizard.webSearchKeyTitle")}
        hint={t(saved?.webSearch ? "wizard.keyHintSaved" : "wizard.keyHint")}
        onSubmit={webSearchKey => advance({ webSearchKey })}
      />
    )
  }

  if (step === "voiceUrl") {
    return (
      <InputStep
        title={t("wizard.voiceUrlTitle")}
        hint={t("wizard.voiceUrlHint")}
        defaultValue={result.voiceUrl ?? DEFAULT_SPEACHES_URL}
        onSubmit={voiceUrl => advance({ voiceUrl })}
      />
    )
  }

  if (step === "telegramId") {
    return (
      <InputStep
        title={t("wizard.telegramIdTitle")}
        hint={t("wizard.telegramIdHint")}
        defaultValue={result.telegramId}
        onSubmit={telegramId => advance({ telegramId })}
      />
    )
  }

  if (step === "telegramToken") {
    return (
      <InputStep
        secret
        title={t("wizard.telegramTokenTitle")}
        hint={t(saved?.telegram ? "wizard.keyHintSaved" : "wizard.keyHint")}
        onSubmit={telegramToken => advance({ telegramToken })}
      />
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>{t("wizard.summaryTitle")}</Text>
      <Box flexDirection="column">
        <SummaryRow
          label={t("wizard.summaryMode")}
          value={result.mode && t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")}
        />
        <SummaryRow
          label={t("wizard.summaryLanguage")}
          value={result.language ? LOCALE_LABELS[result.language] : undefined}
        />
        <SummaryRow
          label={t("wizard.summaryProvider")}
          value={result.provider ? t(PROVIDER_LABEL_KEY[result.provider]) : undefined}
        />
        <SummaryRow label={t("wizard.summaryBaseUrl")} value={result.baseUrl} />
        <SummaryRow
          label={t("wizard.summaryExtras")}
          value={result.extras?.length ? result.extras.map(e => t(EXTRA_LABEL_KEY[e])).join(", ") : undefined}
        />
      </Box>
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
