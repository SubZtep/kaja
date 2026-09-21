import { PasswordInput, TextInput } from "@inkjs/ui"
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

/** Asks for one value that isn't a secret (a server URL, a numeric id), so it stays readable while typing. Enter with a value submits it; Esc or an empty Enter skips. */
export function TextPrompt({
  title,
  hint,
  defaultValue,
  onSubmit,
  onSkip
}: Readonly<{
  title: string
  hint?: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onSkip: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape) onSkip()
  })
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Text dimColor>{hint ?? t("secretPrompt.hint")}</Text>
      <TextInput defaultValue={defaultValue} onSubmit={value => (value.trim() ? onSubmit(value.trim()) : onSkip())} />
    </Box>
  )
}

/** A yes/no question with "no" first, so Enter and Esc both pick the safe answer — unless `defaultYes` says the safe answer is yes. */
export function YesNoPrompt({
  title,
  yesLabel,
  noLabel,
  defaultYes,
  yesFirst,
  onResolve
}: Readonly<{
  title: string
  yesLabel: string
  noLabel: string
  /** Opens on "yes", for a question where doing nothing is the worse outcome. Esc still answers no. */
  defaultYes?: boolean
  /** Lists "yes" on top, for a question whose expected answer is yes. Esc still answers no. */
  yesFirst?: boolean
  onResolve: (yes: boolean) => void
}>) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{title}</Text>
      <SelectMenu
        width={Math.max(yesLabel.length, noLabel.length) + 10}
        items={yesFirst ? [yesLabel, noLabel] : [noLabel, yesLabel]}
        initialIndex={(defaultYes ? 1 : 0) ^ (yesFirst ? 1 : 0)}
        onSelect={index => onResolve((index === 1) !== Boolean(yesFirst))}
        onClose={() => onResolve(false)}
      />
    </Box>
  )
}

/** A short list to pick from, with the first item as the safe answer: Enter on it and Esc both leave things as they are. */
export function PickPrompt({
  title,
  items,
  onResolve
}: Readonly<{
  title: string
  items: string[]
  /** The chosen item's index, or undefined when dismissed. */
  onResolve: (index: number | undefined) => void
}>) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{title}</Text>
      <SelectMenu
        width={Math.max(...items.map(item => item.length)) + 10}
        items={items}
        initialIndex={0}
        onSelect={index => onResolve(index)}
        onClose={() => onResolve(undefined)}
      />
    </Box>
  )
}
