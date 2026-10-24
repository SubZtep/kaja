import { Box, Text } from "ink"
import { type ReactNode, useEffect, useEffectEvent, useState } from "react"
import { useKey } from "../hooks/use-key"
import { t } from "../lib/i18n"
import { KeyHint, Question, Spinner, textWidth } from "./elem/rail"
import { SelectMenu } from "./elem/select-menu"
import { useKajaTheme } from "./theme"

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

/** Why Enter didn't move on: the hint line of a question whose answer was refused, after a "✗". */
export function Problem({ children }: Readonly<{ children: string }>) {
  const { danger } = useKajaTheme()
  return <Text {...danger()}>✗ {children}</Text>
}

/**
 * What a live check found: fine, worth a word (a server that isn't up yet), or refused (a key rejected). `note` is
 * short, at the right of the field; `detail` (the error) goes on the hint line when it isn't fine.
 */
export type LiveCheck = { tone: "ok" | "warn" | "bad"; note: string; detail?: string }

// How long typing has to pause before an answer is checked over the network
const CHECK_DELAY_MS = 600

// A key shows as a fixed run of dots, so its length stays hidden, then its last 4 once it's long enough not to give it away
const MASK = "•".repeat(24)
const TAIL_FROM = 12

/** A secret as the field shows it: dots, and the last 4 characters of a long one, so a wrong paste is spotted. */
export function maskSecret(value: string): string {
  if (!value) return ""
  return value.length >= TAIL_FROM ? `${MASK}${value.slice(-4)}` : MASK
}

/** A live check's result at the right of the field: its mark and short note in its tone's colour. */
function LiveMark({ result }: Readonly<{ result?: LiveCheck }>) {
  const theme = useKajaTheme()
  if (!result)
    return (
      <Text dimColor>
        <Spinner /> {t("secretPrompt.checking")}
      </Text>
    )
  const style = { ok: theme.success(), warn: theme.warning(), bad: theme.danger() }[result.tone]
  const mark = { ok: "✓", warn: "!", bad: "✗" }[result.tone]
  return (
    <Text {...style} wrap="truncate-end">
      {mark} {result.note}
    </Text>
  )
}

// Printable text only: a paste can carry line breaks and other control characters
const printable = (input: string) =>
  Array.from(input)
    .filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join("")

/**
 * Asks for one typed answer on a "›" line: a key (`secret`, masked and never prefilled) or a plain value such as an
 * address. The trimmed answer goes through `validate`, and a refused one keeps the question open with the reason on the
 * hint line. With `onSkip`, Esc or an empty Enter skips; without it, an empty answer is submitted like any other, for
 * the caller to read. With `onBack`, Esc goes back instead. `validate` also runs while typing, and `check` (a network
 * test) once typing pauses, its result at the right of the field.
 */
export function InputPrompt({
  title,
  hint,
  placeholder,
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
  /** The closing line's hint; Enter and what it does by default. */
  hint?: ReactNode
  /** Shown dim in the empty field, e.g. that Enter keeps a key already saved. */
  placeholder?: string
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
  const [typed, setTyped] = useState(secret ? "" : (defaultValue ?? ""))
  // Where the cursor is in `typed`; a secret's stays at the end, since its characters can't be seen
  const [cursor, setCursor] = useState(typed.length)
  // The check's latest answer, for the value it was run on; no result yet while it runs
  const [live, setLive] = useState<{ value: string; result?: LiveCheck }>()
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

  const edit = (next: string, at: number) => {
    setTyped(next)
    setCursor(at)
    setProblem(undefined)
  }
  const submit = () => {
    if (!value && onSkip) return onSkip()
    const complaint = validate?.(value)
    setProblem(complaint)
    if (!complaint) onSubmit(value)
  }
  useKey((input, key) => {
    if (key.escape) return (onBack ?? onSkip)?.()
    if (key.return) return submit()
    if (key.backspace || key.delete) {
      if (cursor > 0) edit(typed.slice(0, cursor - 1) + typed.slice(cursor), cursor - 1)
      return
    }
    // Ctrl+U clears the line: the quick way out of a wrong paste
    if (key.ctrl && input === "u") return edit("", 0)
    if (!secret && key.leftArrow) return setCursor(Math.max(0, cursor - 1))
    if (!secret && key.rightArrow) return setCursor(Math.min(typed.length, cursor + 1))
    if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.tab) return
    const text = printable(input)
    if (text) edit(typed.slice(0, cursor) + text + typed.slice(cursor), cursor + text.length)
  })

  const { accent } = useKajaTheme()
  const complaint = problem ?? (value ? validate?.(value) : undefined)
  const result = live?.value === value ? live : undefined
  let below: ReactNode = hint ?? <KeyHint keys={[["Enter", t("hint.save")]]} note={t("secretPrompt.hint")} />
  if (complaint) below = <Problem>{complaint}</Problem>
  else if (result?.result?.tone === "bad") below = <Text dimColor>{t("secretPrompt.refusedHint")}</Text>
  else if (result?.result?.detail)
    below = (
      <Text dimColor wrap="truncate-end">
        {result.result.detail}
      </Text>
    )

  const shown = secret ? maskSecret(typed) : typed
  const at = secret ? shown.length : cursor
  return (
    <Question title={title} hint={below}>
      <Box flexDirection="column">
        <Box width={textWidth()} justifyContent="space-between" gap={2}>
          <Text wrap="truncate-start">
            <Text {...accent()}>›</Text> {shown.slice(0, at)}
            <Text inverse>{shown[at] ?? " "}</Text>
            {shown.slice(at + 1)}
            {!typed && placeholder ? <Text dimColor>{placeholder}</Text> : null}
          </Text>
          {result ? <LiveMark result={result.result} /> : null}
        </Box>
        <Text> </Text>
      </Box>
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
