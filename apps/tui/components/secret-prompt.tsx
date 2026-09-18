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

/** A value didn't pass its live test: save it anyway (e.g. offline right now) or drop it. Esc drops it. */
export function SaveAnywayPrompt({
  title,
  onResolve
}: Readonly<{
  title: string
  onResolve: (save: boolean) => void
}>) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{title}</Text>
      <SelectMenu
        width={40}
        items={[t("secretPrompt.dontSave"), t("secretPrompt.saveAnyway")]}
        onSelect={index => onResolve(index === 1)}
        onClose={() => onResolve(false)}
      />
    </Box>
  )
}
