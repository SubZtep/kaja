import type { PersonaModels } from "@kaja/schema/cli"
import { Box, type BoxProps, useWindowSize } from "ink"
import { useEffect, useState } from "react"
import { useDictation } from "../../hooks/use-dictation"
import { useKey } from "../../hooks/use-key"
import { usePromptHistory } from "../../hooks/use-prompt-history"
import { useWindowFocus } from "../../hooks/use-window-focus"
import { t } from "../../lib/i18n"
import { uiEvents } from "../../lib/ui-events"
import { TextInput } from "../elem/text-input"
import { useKajaTheme } from "../theme"

/**
 * Outer box max rows (padding/border included). Content lines for the field leave room for SolidBorder padding (1+1) or
 * PowerBorder edges (~1+1).
 */
const INPUT_MAX_HEIGHT = 8
const INPUT_CONTENT_LINES = 6
const CURSOR_BLINK_MS = 500
/** Always 2 ASCII cells — never emoji (terminals disagree on emoji width). */
const PREFIX_COLS = 2

/**
 * Status mark for the input gutter. Pure ASCII so multi-line hang-indent matches the first line exactly.
 *
 * > Ready to type
 *
 * - Mic on, idle o recording speech ~ transcribing x mic muted while agent speaks
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
  asking = false,
  send,
  history: initialHistory,
  personaModels,
  placeholder,
  onDraft
}: Readonly<{
  pending: boolean
  /** The agent's voice is audibly playing — mute the mic so it isn't heard. */
  speaking: boolean
  /** The agent's ask_user call is waiting for this answer — the power border marks it as a reply, not a new prompt. */
  asking?: boolean
  send: (prompt: string) => Promise<void>
  /** Past prompts for shell-style ↑/↓ recall, newest first. */
  history?: string[]
  /** Active persona's per-task model overrides, if any — passed through to dictation's STT resolution. */
  personaModels?: PersonaModels
  /** Hint shown while empty; defaults to the plain chat one. */
  placeholder?: string
  /** Called with the text whenever it changes (typed, dictated, recalled or cleared by sending). */
  onDraft?: (draft: string) => void
}>) {
  const [input, setInput] = useState("")
  const [mic, setMic] = useState(false)
  const { columns } = useWindowSize()
  const history = usePromptHistory(initialHistory ?? [])
  useEffect(() => onDraft?.(input), [input, onDraft])
  // Human edits (typing, dictation) reset the recall position; recalled text itself goes through plain setInput so it doesn't.
  const editInput = (value: string) => {
    history.markEdited()
    uiEvents.emit("follow")
    setInput(value)
  }

  // Ctrl+T toggles dictation (Esc quits, see useQuitGuard).
  useKey((char, key) => {
    if (key.ctrl && char === "t") setMic(prev => !prev)
  })
  // Half-duplex: while the agent's voice plays, the mic is paused (captured audio dropped) so it doesn't transcribe the agent talking to itself.
  const sttState = useDictation(
    mic && !speaking,
    text => {
      history.markEdited()
      uiEvents.emit("follow")
      setInput(prev => (prev ? `${prev} ${text}` : text))
    },
    personaModels
  )

  const prefix = statusPrefix(mic, speaking, sttState)
  const windowFocused = useWindowFocus()

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
      <Border variant={asking ? "power" : "solid"}>
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
          placeholder={placeholder ?? t("input.placeholder")}
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

  const boxProps: BoxProps = {
    ...inputBox(),
    borderStyle: "classic",
    borderDimColor: true,
    borderLeft: false,
    borderRight: false,
    width: "100%",
    flexShrink: 0,
    maxHeight: INPUT_MAX_HEIGHT,
    overflow: "hidden",
    ...(isPower && {
      borderStyle: "arrow",
      borderColor: powerBox().borderColor
    })
  }

  return <Box {...boxProps}>{children}</Box>
}
