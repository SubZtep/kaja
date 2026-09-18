import { PasswordInput } from "@inkjs/ui"
import { LOCALE_LABELS, locales } from "@kaja/shared"
import { Box, Text, useInput } from "ink"
import { useState } from "react"
import type { Language } from "../lib/i18n"
import { t } from "../lib/i18n"
import { listPaths } from "../lib/paths"
import { SelectMenu } from "./elem/select-menu"

export type WizardResult = {
  language?: Language
  provider?: "fireworks" | "ollama" | "llama" | "fetch"
  apiKey?: string
}

type Step = "language" | "provider" | "apiKey" | "summary"

const STEP_ORDER: Step[] = ["language", "provider", "apiKey", "summary"]

/**
 * Multi-step re-runnable setup wizard for `kaja config wizard`. First run has its own narrower
 * prompt (lib/cli/first-run.tsx). Escape/backspace/delete at any step cancels the whole wizard,
 * same dismissal contract as {@link SelectMenu}. Each step writes nothing itself — the caller
 * applies the collected {@link WizardResult} once `onDone` fires, via the existing config/secrets writers.
 */
export function ConfigWizard({
  prefill,
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  onDone: (result: WizardResult) => void
  onCancel: () => void
}>) {
  const [step, setStep] = useState<Step>("language")
  const [result, setResult] = useState<WizardResult>(prefill ?? {})

  useInput((_input, key) => {
    if (step === "summary" && (key.return || key.escape)) onDone(result)
  })

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    setResult(next)
    const currentIndex = STEP_ORDER.indexOf(step)
    let nextStep = STEP_ORDER[currentIndex + 1] ?? "summary"
    // Only fireworks needs a key from this flow; ollama/llama are typically local, and "fetch" takes
    // its provider list from the server. Skipped here rather than mid-render so the step never
    // renders just to immediately advance out of itself.
    if (nextStep === "apiKey" && next.provider !== "fireworks") nextStep = "summary"
    setStep(nextStep)
  }

  if (step === "language") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.languageTitle")}</Text>
        <SelectMenu
          items={locales.map(locale => LOCALE_LABELS[locale])}
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
          items={[
            t("wizard.providerFetch"),
            t("wizard.providerFireworks"),
            t("wizard.providerOllama"),
            t("wizard.providerLlama")
          ]}
          width={70}
          onSelect={index => {
            const choices = ["fetch", "fireworks", "ollama", "llama"] as const
            advance({ provider: choices[index] })
          }}
          onClose={onCancel}
        />
      </Box>
    )
  }

  if (step === "apiKey") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.apiKeyTitle")}</Text>
        <Box borderStyle="classic" width={70} borderColor="magenta" paddingLeft={1}>
          <PasswordInput placeholder={t("wizard.apiKeyPlaceholder")} onSubmit={value => advance({ apiKey: value })} />
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>{t("wizard.summaryTitle")}</Text>
      <Box flexDirection="column">
        {listPaths(true).map(({ label, path }) => (
          <Text key={path} dimColor>
            {"  "}
            {label}: {path}
          </Text>
        ))}
      </Box>
      <Text dimColor>{t("wizard.summaryHint")}</Text>
    </Box>
  )
}
