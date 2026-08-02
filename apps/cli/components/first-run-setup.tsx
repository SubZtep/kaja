import { Box, Text } from "ink"
import { useState } from "react"
import { t } from "../lib/i18n"
import { Menu } from "./menu"

export type FirstRunChoice =
  | { chatModelId: "kaja-free-chat" }
  | { chatModelId: "chat-default"; template?: "fireworks" | "ollama" }

/**
 * One-shot first-run prompt, rendered before the main App and resolved via
 * `onDone`: free hosted chat (default) needs nothing else, "own provider"
 * asks a second question for which example models.toml to start from.
 * Dismissing (escape/backspace/delete, or Ctrl-C) calls `onCancel` instead,
 * so nothing gets written unless the user actually picks an option.
 */
export function FirstRunSetup({
  onDone,
  onCancel
}: Readonly<{ onDone: (choice: FirstRunChoice) => void; onCancel: () => void }>) {
  const [step, setStep] = useState<"provider" | "template">("provider")

  return (
    <Box flexDirection="column" gap={1}>
      <Text>{t("firstRun.intro")}</Text>
      {step === "provider" && (
        <Menu
          items={[t("firstRun.useFree"), t("firstRun.useOwn")]}
          onSelect={index => {
            if (index === 0) onDone({ chatModelId: "kaja-free-chat" })
            else setStep("template")
          }}
          onClose={onCancel}
        />
      )}
      {step === "template" && (
        <Menu
          items={[t("firstRun.templateFireworks"), t("firstRun.templateOllama"), t("firstRun.templateSkip")]}
          onSelect={index => {
            if (index === 0) onDone({ chatModelId: "chat-default", template: "fireworks" })
            else if (index === 1) onDone({ chatModelId: "chat-default", template: "ollama" })
            else onDone({ chatModelId: "chat-default" })
          }}
          onClose={onCancel}
        />
      )}
    </Box>
  )
}
