import { PasswordInput, TextInput } from "@inkjs/ui"
import { Text } from "ink"
import { useEffect, useEffectEvent, useState } from "react"
import { useKey } from "../hooks/use-key"
import { t } from "../lib/i18n"
import { InputFrame, KeyHint, Question } from "./elem/rail"
import { SelectMenu } from "./elem/select-menu"
import { useKajaTheme } from "./theme"

/** Why Enter didn't move on: the line under a question whose answer was refused. */
export function Problem({ children }: Readonly<{ children: string }>) {
  const { danger } = useKajaTheme()
  return <Text {...danger()}>{children}</Text>
}

// The keys of a short list you pick one from
function PickKeys() {
  return (
    <KeyHint
      keys={[
        ["↑↓", t("hint.move")],
        ["Enter", t("hint.pick")]
      ]}
    />
  )
}

/** What a live check found: fine, worth a word (a server that isn't up yet), or refused (a key rejected). */
export type LiveCheck = { tone: "ok" | "warn" | "bad"; note: string }

// How long typing has to pause before an answer is checked over the network
const CHECK_DELAY_MS = 600

/** A live check's line under the field, in its tone's colour. */
function LiveLine({ result, confirming }: Readonly<{ result?: LiveCheck; confirming: boolean }>) {
  const theme = useKajaTheme()
  if (!result) return <Text dimColor>{t("secretPrompt.checking")}</Text>
  const style = { ok: theme.success(), warn: theme.warning(), bad: theme.danger() }[result.tone]
  const mark = { ok: "✓", warn: "!", bad: "✗" }[result.tone]
  return (
    <Text {...style}>
      {mark} {result.note}
      {confirming ? ` ${t("secretPrompt.enterAgain")}` : ""}
    </Text>
  )
}

/**
 * Asks for one typed answer: a key (`secret`, masked and never prefilled) or a plain value such as an address. The
 * trimmed answer goes through `validate`, and a refused one keeps the question open with the reason under it. With
 * `onSkip`, Esc or an empty Enter skips; without it, an empty answer is submitted like any other, for the caller to
 * read. With `onBack`, Esc goes back instead. `validate` also runs while typing, and `check` (a network test) once
 * typing pauses; Enter on an answer `check` refused asks for a second Enter before it's taken.
 */
export function InputPrompt({
  title,
  hint,
  secret,
  defaultValue,
  validate,
  onSubmit,
  onSkip,
  onBack,
  check
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
  /** Esc returns to the previous question, as the setup wizard does. */
  onBack?: () => void
  /** Tests an answer over the network, e.g. a key against its provider; aborted when the answer changes. */
  check?: (value: string, signal: AbortSignal) => Promise<LiveCheck | undefined>
}>) {
  const [problem, setProblem] = useState<string>()
  const [typed, setTyped] = useState(defaultValue ?? "")
  // The check's latest answer, for the value it was run on; no result yet while it runs
  const [live, setLive] = useState<{ value: string; result?: LiveCheck }>()
  // A refused value Enter was pressed on once: the next Enter on it takes it anyway
  const [confirming, setConfirming] = useState<string>()
  // Callers pass fresh functions each render; the check reruns only when the answer changes
  const checkable = useEffectEvent((answer: string) => (check && !validate?.(answer) ? check : undefined))

  const value = typed.trim()
  useEffect(() => {
    setLive(undefined)
    const run = value ? checkable(value) : undefined
    if (!run) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLive({ value })
      run(value, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) setLive(result ? { value, result } : undefined)
        })
        .catch(() => {
          if (!controller.signal.aborted) setLive(undefined)
        })
    }, CHECK_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  useKey(
    (_input, key) => {
      if (key.escape) (onBack ?? onSkip)?.()
    },
    { isActive: Boolean(onBack ?? onSkip) }
  )
  const submit = (raw: string) => {
    const answer = raw.trim()
    if (!answer && onSkip) return onSkip()
    const complaint = validate?.(answer)
    setProblem(complaint)
    if (complaint) return
    const refused = live?.value === answer && live.result?.tone === "bad"
    if (refused && confirming !== answer) return setConfirming(answer)
    onSubmit(answer)
  }
  const onChange = (next: string) => {
    // The inputs report the unchanged value again on Enter, which mustn't undo a pending confirmation
    if (next === typed) return
    setTyped(next)
    setProblem(undefined)
    setConfirming(undefined)
  }
  const complaint = value ? validate?.(value) : undefined
  let below = <Text dimColor>{hint ?? t("secretPrompt.hint")}</Text>
  if (problem ?? complaint) below = <Problem>{(problem ?? complaint)!}</Problem>
  else if (live?.value === value) below = <LiveLine result={live.result} confirming={confirming === value} />
  return (
    <Question title={title} hint={below}>
      <InputFrame>
        {secret ? (
          <PasswordInput placeholder={t("secretPrompt.placeholder")} onChange={onChange} onSubmit={submit} />
        ) : (
          <TextInput defaultValue={defaultValue} onChange={onChange} onSubmit={submit} />
        )}
      </InputFrame>
    </Question>
  )
}

/**
 * A yes/no question with "no" first, so Enter and Esc both pick the safe answer — unless `defaultYes` says the safe
 * answer is yes.
 */
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
    <Question title={title} hint={<PickKeys />}>
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
    <Question title={title} hint={<PickKeys />}>
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
