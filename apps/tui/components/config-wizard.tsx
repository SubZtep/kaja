import { TextInput } from "@inkjs/ui"
import { LOCALE_LABELS, locales } from "@kaja/shared"
import { Box, Text, useInput } from "ink"
import { useState } from "react"
import type { KajaMode } from "../lib/config/mode"
import type { Language } from "../lib/i18n"
import { t } from "../lib/i18n"
import { listPaths } from "../lib/paths"
import { SelectMenu } from "./elem/select-menu"

export type WizardProvider = "fireworks" | "ollama" | "llama" | "fetch" | "skip"

/** What to do about abilities; the marketplace work itself happens after the wizard, not in it. */
export type WizardAbilities = "starter" | "pick" | "none"

export type WizardResult = {
  mode?: KajaMode
  language?: Language
  provider?: WizardProvider
  /** Where a local provider's server listens; only collected for the ones that run on this machine. */
  baseUrl?: string
  abilities?: WizardAbilities
}

type Step = "mode" | "language" | "provider" | "baseUrl" | "abilities" | "summary"

const STEP_ORDER: Step[] = ["mode", "language", "provider", "baseUrl", "abilities", "summary"]

const ABILITY_CHOICES: WizardAbilities[] = ["starter", "pick", "none"]

const ABILITY_LABEL_KEY: Record<WizardAbilities, string> = {
  starter: "wizard.abilitiesStarter",
  pick: "wizard.abilitiesPick",
  none: "wizard.abilitiesNone"
}

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
 * The step a completed one hands off to. Cloud needs no provider, and only a provider that runs on
 * this machine is asked for an address. No step asks for an API key: the credential pass that runs
 * after the wizard writes its files asks for every key the finished config needs, and tests it.
 * Resolved here rather than mid-render so a skipped step never mounts just to advance out of itself.
 */
function nextStepAfter(step: Step, result: WizardResult): Step {
  const last = STEP_ORDER.length - 1
  for (let index = STEP_ORDER.indexOf(step) + 1; index < last; index++) {
    const candidate = STEP_ORDER[index]!
    if (candidate === "provider" && result.mode === "cloud") continue
    if (candidate === "baseUrl" && (result.mode === "cloud" || !LOCAL_PROVIDER_URLS[result.provider!])) continue
    // Cloud abilities live in the account and are picked on the web, not in files this client reads.
    if (candidate === "abilities" && result.mode === "cloud") continue
    return candidate
  }
  return "summary"
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
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  /** Mode already forced by `--cloud`/`--local`; the mode step is skipped when set. */
  mode?: KajaMode
  onDone: (result: WizardResult) => void
  onCancel: () => void
}>) {
  const initial: WizardResult = { ...prefill, ...(mode ? { mode } : {}) }
  const [step, setStep] = useState<Step>(mode ? nextStepAfter("mode", initial) : "mode")
  const [result, setResult] = useState<WizardResult>(initial)

  useInput((_input, key) => {
    if (step === "summary" && (key.return || key.escape)) onDone(result)
  })

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    setResult(next)
    setStep(nextStepAfter(step, next))
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
          initialIndex={result.language ? locales.indexOf(result.language) : undefined}
          onSelect={index => advance({ language: locales[index] })}
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

  if (step === "baseUrl") {
    const fallback = LOCAL_PROVIDER_URLS[result.provider!] ?? ""
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.baseUrlTitle")}</Text>
        <Box borderStyle="classic" width={70} borderColor="magenta" paddingLeft={1}>
          <TextInput
            defaultValue={result.baseUrl ?? fallback}
            onSubmit={value => advance({ baseUrl: value.trim() || fallback })}
          />
        </Box>
        <Text dimColor>{t("wizard.baseUrlHint")}</Text>
      </Box>
    )
  }

  if (step === "abilities") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.abilitiesTitle")}</Text>
        <SelectMenu
          items={ABILITY_CHOICES.map(choice => t(ABILITY_LABEL_KEY[choice]))}
          width={70}
          initialIndex={Math.max(0, ABILITY_CHOICES.indexOf(result.abilities ?? "starter"))}
          onSelect={index => advance({ abilities: ABILITY_CHOICES[index] })}
          onClose={onCancel}
        />
      </Box>
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
          label={t("wizard.summaryAbilities")}
          value={result.abilities ? t(ABILITY_LABEL_KEY[result.abilities]) : undefined}
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
