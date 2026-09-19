import { PasswordInput } from "@inkjs/ui"
import { Box, Text, useInput } from "ink"
import { t } from "../lib/i18n"
import { SelectMenu } from "./elem/select-menu"

/** Asks for one secret, masked. Enter with a value submits it; Esc or an empty Enter skips. */
export function SecretPrompt({
  title,
  onSubmit,
  onSkip
}: Readonly<{
  /** What's needed and why, e.g. "github needs an API key (header Authorization)." */
  title: string
  onSubmit: (value: string) => void
  onSkip: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape) onSkip()
  })
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Text dimColor>{t("secretPrompt.hint")}</Text>
      <PasswordInput
        placeholder={t("secretPrompt.placeholder")}
        onSubmit={value => (value.trim() ? onSubmit(value.trim()) : onSkip())}
      />
    </Box>
  )
}

/** A yes/no question with "no" first, so Enter and Esc both pick the safe answer. */
export function YesNoPrompt({
  title,
  yesLabel,
  noLabel,
  onResolve
}: Readonly<{
  title: string
  yesLabel: string
  noLabel: string
  onResolve: (yes: boolean) => void
}>) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{title}</Text>
      <SelectMenu
        width={Math.max(yesLabel.length, noLabel.length) + 10}
        items={[noLabel, yesLabel]}
        onSelect={index => onResolve(index === 1)}
        onClose={() => onResolve(false)}
      />
    </Box>
  )
}
