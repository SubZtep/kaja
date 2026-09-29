import type { PersonaModels } from "@kaja/schema/cli"
import { Box, useInput, useWindowSize } from "ink"
import { useEffect, useState } from "react"
import { useDictation } from "../../hooks/use-dictation"
import { usePromptHistory } from "../../hooks/use-prompt-history"
import { useWindowFocus } from "../../hooks/use-window-focus"
import { t } from "../../lib/i18n"
import { TextInput } from "../elem/text-input"
import { useKajaTheme } from "../theme"

/**
 * Outer box max rows (padding/border included). Content lines for the field
 * leave room for SolidBorder padding (1+1) or PowerBorder edges (~1+1).
 */
const INPUT_MAX_HEIGHT = 8
const INPUT_CONTENT_LINES = 6
const CURSOR_BLINK_MS = 500
/** Idle time before the placeholder hint disappears. */
const HINT_HIDE_MS = 20_000
/** Idle time before the border switches to the "power" style. */
const POWER_BORDER_MS = 30_000
/** Always 2 ASCII cells — never emoji (terminals disagree on emoji width). */
const PREFIX_COLS = 2

/**
 * Status mark for the input gutter. Pure ASCII so multi-line hang-indent
 * matches the first line exactly.
 *
 *   >  ready to type
 *   *  mic on, idle
 *   o  recording speech
 *   ~  transcribing
 *   x  mic muted while agent speaks
 */
function statusPrefix(mic: boolean, speaking: boolean, sttState: string): string {
  if (!mic) return "> "
  if (speaking) return "x "
  if (sttState === "recording") return "o "
  if (sttState === "transcribing") return "~ "
  return "* "
}

export function UserInput({
  pending,
  speaking,
  send,
  history: initialHistory,
  personaModels
}: Readonly<{
  pending: boolean
  /** The agent's voice is audibly playing — mute the mic so it isn't heard. */
  speaking: boolean
  send: (prompt: string) => Promise<void>
  /** Past prompts for shell-style ↑/↓ recall, newest first. */
  history?: string[]
  /** Active persona's per-task model overrides, if any — passed through to dictation's STT resolution. */
  personaModels?: PersonaModels
}>) {
  const [input, setInput] = useState("")
  // Thresholds flip once each, so a quiet input never re-renders on a timer.
  const [hintHidden, setHintHidden] = useState(false)
  const [power, setPower] = useState(false)
  const [mic, setMic] = useState(false)
  const { columns } = useWindowSize()
  const history = usePromptHistory(initialHistory ?? [])
  // Human edits (typing, dictation) reset the recall position; recalled text itself goes through plain setInput so it doesn't.
  const editInput = (value: string) => {
    history.markEdited()
    setInput(value)
  }

  // Ctrl+T toggles dictation (Esc quits, see useQuitGuard).
  useInput((char, key) => {
    if (key.ctrl && char === "t") setMic(prev => !prev)
  })
  // Half-duplex: while the agent's voice plays, the mic is paused (captured audio dropped) so it doesn't transcribe the agent talking to itself.
  const sttState = useDictation(
    mic && !speaking,
    text => {
      history.markEdited()
      setInput(prev => (prev ? `${prev} ${text}` : text))
    },
    personaModels
  )

  const prefix = statusPrefix(mic, speaking, sttState)
  const windowFocused = useWindowFocus()

  useEffect(() => {
    setHintHidden(false)
    setPower(false)
    const hint = setTimeout(() => setHintHidden(true), HINT_HIDE_MS)
    const border = setTimeout(() => setPower(true), POWER_BORDER_MS)

    return () => {
      clearTimeout(hint)
      clearTimeout(border)
    }
  }, [pending, input])

  const handleSubmit = (value: string) => {
    if (!value.trim() || pending) return
    history.commit(value)
    setInput("")
    send(value)
  }

  // padding/border (~2) + fixed 2-col ASCII prefix.
  const sideChrome = 2
  const fieldColumns = Math.max(8, columns - sideChrome - PREFIX_COLS - 1)

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Border variant={power ? "power" : "solid"}>
        <TextInput
          value={input}
          focus={!pending}
          onChange={editInput}
          onSubmit={handleSubmit}
          onHistory={(dir, current) => {
            const recalled = history.recall(dir, current)
            if (recalled !== null) setInput(recalled)
            return recalled
          }}
          showCursor={!mic}
          blinkMs={CURSOR_BLINK_MS}
          blinkPaused={!windowFocused}
          placeholder={hintHidden ? undefined : t("input.placeholder")}
          prefix={prefix}
          prefixCols={PREFIX_COLS}
          columns={fieldColumns}
          maxVisibleLines={INPUT_CONTENT_LINES}
        />
      </Border>
    </Box>
  )
}

function Border({ children, variant = "solid" }: Readonly<{ children: React.ReactNode; variant?: "solid" | "power" }>) {
  const isPower = variant === "power"
  const { inputBox, powerBox } = useKajaTheme()

  const boxProps: any = {
    ...inputBox(),
    borderStyle: "classic",
    borderDimColor: true,
    borderLeftDimColor: false,
    borderRightDimColor: false,
    width: "100%",
    flexShrink: 0,
    maxHeight: INPUT_MAX_HEIGHT,
    overflow: "hidden"
  }

  if (isPower) {
    boxProps.borderStyle = "arrow"
    boxProps.borderColor = powerBox().borderColor
    boxProps.borderLeftDimColor = true
    boxProps.borderRightDimColor = true
  }

  return <Box {...boxProps}>{children}</Box>
}
