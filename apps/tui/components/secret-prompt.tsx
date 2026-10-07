import { PasswordInput, TextInput } from "@inkjs/ui"
import { Text, useInput } from "ink"
import { useState } from "react"
import { t } from "../lib/i18n"
import { InputFrame, Question } from "./elem/rail"
import { SelectMenu } from "./elem/select-menu"
import { useKajaTheme } from "./theme"

/** Why Enter didn't move on: the line under a question whose answer was refused. */
export function Problem({ children }: Readonly<{ children: string }>) {
  const { danger } = useKajaTheme()
  return <Text {...danger()}>{children}</Text>
}

/**
 * Asks for one typed answer: a key (`secret`, masked and never prefilled) or a plain value such as an address. The
 * trimmed answer goes through `validate`, and a refused one keeps the question open with the reason under it. With
 * `onSkip`, Esc or an empty Enter skips; without it, an empty answer is submitted like any other, for the caller to read.
 */
export function InputPrompt({
  title,
  hint,
  secret,
  defaultValue,
  validate,
  onSubmit,
  onSkip
}: Readonly<{
  /** What's needed and why, e.g. "github needs an API key (header Authorization)." */
  title: string
  hint?: string
  secret?: boolean
  defaultValue?: string
  /** Says what is wrong with an answer, or nothing when it is fine. */
  validate?: (value: string) => string | undefined
  onSubmit: (value: string) => void
  onSkip?: () => void
}>) {
  const [problem, setProblem] = useState<string>()
  useInput(
    (_input, key) => {
      if (key.escape) onSkip?.()
    },
    { isActive: Boolean(onSkip) }
  )
  const submit = (raw: string) => {
    const value = raw.trim()
    if (!value && onSkip) return onSkip()
    const complaint = validate?.(value)
    setProblem(complaint)
    if (!complaint) onSubmit(value)
  }
  return (
    <Question title={title}>
      <InputFrame>
        {secret ? (
          <PasswordInput placeholder={t("secretPrompt.placeholder")} onSubmit={submit} />
        ) : (
          <TextInput defaultValue={defaultValue} onSubmit={submit} />
        )}
      </InputFrame>
      {problem ? <Problem>{problem}</Problem> : <Text dimColor>{hint ?? t("secretPrompt.hint")}</Text>}
    </Question>
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
    <Question title={title}>
      <SelectMenu
        width={Math.max(yesLabel.length, noLabel.length) + 10}
        items={yesFirst ? [yesLabel, noLabel] : [noLabel, yesLabel]}
        initialIndex={(defaultYes ? 1 : 0) ^ (yesFirst ? 1 : 0)}
        onSelect={index => onResolve((index === 1) !== Boolean(yesFirst))}
        onClose={() => onResolve(false)}
      />
    </Question>
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
    <Question title={title}>
      <SelectMenu
        width={Math.max(...items.map(item => item.length)) + 10}
        items={items}
        initialIndex={0}
        onSelect={index => onResolve(index)}
        onClose={() => onResolve(undefined)}
      />
    </Question>
  )
}
