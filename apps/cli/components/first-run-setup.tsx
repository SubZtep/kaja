import { Box, Text } from "ink"
import { useState } from "react"
import { t } from "../lib/i18n"
import { listPaths } from "../lib/paths"
import { SelectMenu } from "./select-menu"

export type FirstRunChoice = { useFree: true } | { useFree: false; template?: "fireworks" | "ollama" }

/**
 * One-shot first-run prompt, rendered before the main App and resolved via
 * `onDone`: free hosted chat (default) needs nothing else, "own provider"
 * asks a second question for which provider's example models.toml to start
 * from. Dismissing (escape/backspace/delete, or Ctrl-C) calls `onCancel`
 * instead, so nothing gets written unless the user actually picks an option.
 */
export function FirstRunSetup({
  onDone,
  onCancel
}: Readonly<{ onDone: (choice: FirstRunChoice) => void; onCancel: () => void }>) {
  const [step, setStep] = useState<"chat" | "provider">("chat")

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text dimColor>{t("firstRun.paths")}</Text>
        {listPaths().map(({ label, path }) => (
          <Text key={path} dimColor>
            {"  "}
            {label}: {path}
          </Text>
        ))}
      </Box>
      <Text>{t("firstRun.intro")}</Text>
      {step === "chat" && (
        <SelectMenu
          items={[t("firstRun.useFree"), t("firstRun.useOwn")]}
          width={70}
          onSelect={index => {
            if (index === 0) onDone({ useFree: true })
            else setStep("provider")
          }}
          onClose={onCancel}
        />
      )}
      {step === "provider" && (
        <SelectMenu
          items={[t("firstRun.providerFireworks"), t("firstRun.providerOllama"), t("firstRun.providerSkip")]}
          width={70}
          onSelect={index => {
            if (index === 0) onDone({ useFree: false, template: "fireworks" })
            else if (index === 1) onDone({ useFree: false, template: "ollama" })
            else onDone({ useFree: false })
          }}
          onClose={onCancel}
        />
      )}
    </Box>
  )
}
