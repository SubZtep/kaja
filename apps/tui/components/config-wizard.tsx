import { PasswordInput } from "@inkjs/ui"
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
  persona?: string
}

type Step = "language" | "provider" | "apiKey" | "persona" | "summary"

const STEP_ORDER: Step[] = ["language", "provider", "apiKey", "persona", "summary"]

/**
 * Multi-step re-runnable setup wizard for `kaja config wizard`. First run has its own narrower
 * prompt (lib/cli/first-run.tsx). Escape/backspace/delete at any step cancels the whole wizard,
 * same dismissal contract as {@link SelectMenu}. Each step writes nothing itself — the caller
 * applies the collected {@link WizardResult} once `onDone` fires, via the existing config/secrets writers.
 */
export function ConfigWizard({
  personaChoices,
  prefill,
  onDone,
  onCancel
}: Readonly<{
  personaChoices: { id: string; label: string }[]
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
    setStep(STEP_ORDER[currentIndex + 1] ?? "summary")
  }

  if (step === "language") {
    const languages: Language[] = ["en-GB", "hu", "nan-TW"]
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.languageTitle")}</Text>
        <SelectMenu items={languages} onSelect={index => advance({ language: languages[index] })} onClose={onCancel} />
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
    // Only fireworks needs a key from this flow; ollama/llama are typically local, fetch has no provider choice yet.
    if (result.provider !== "fireworks") {
      advance({})
      return null
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.apiKeyTitle")}</Text>
        <Box borderStyle="classic" width={70} borderColor="magenta" paddingLeft={1}>
          <PasswordInput placeholder={t("wizard.apiKeyPlaceholder")} onSubmit={value => advance({ apiKey: value })} />
        </Box>
      </Box>
    )
  }

  if (step === "persona") {
    const items = [t("wizard.personaSkip"), ...personaChoices.map(p => p.label)]
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{t("wizard.personaTitle")}</Text>
        <SelectMenu
          items={items}
          width={70}
          onSelect={index => advance({ persona: index === 0 ? undefined : personaChoices[index - 1]?.id })}
          onClose={onCancel}
        />
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
