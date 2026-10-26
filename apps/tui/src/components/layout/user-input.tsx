import type { PersonaModels } from "@kaja/schema/cli"
import { Box, useWindowSize } from "ink"
import { useEffect, useState } from "react"
import { useDictation } from "../../hooks/use-dictation"
import { useKey } from "../../hooks/use-key"
import { usePromptHistory } from "../../hooks/use-prompt-history"
import { useWindowFocus } from "../../hooks/use-window-focus"
import { t } from "../../lib/i18n"
import { uiEvents } from "../../lib/ui-events"
import { TextInput } from "../elem/text-input"
import { paint, usePalette } from "../theme"

const INPUT_CONTENT_LINES = 6
const CURSOR_BLINK_MS = 500
/** Always 2 cells — never emoji (terminals disagree on emoji width). */
const PREFIX_COLS = 2

/**
 * Status mark for the input gutter, one cell so a wrapped line hangs under the first exactly.
 *
 * › Ready to type
 *
 * - Mic on, idle o recording speech ~ transcribing x mic muted while agent speaks
 */
function statusPrefix(mic: boolean, speaking: boolean, sttState: string): string {
  if (!mic) return "› "
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
  onDraft,
  cursorHidden = false,
  mic: controlledMic,
  onMicChange
}: Readonly<{
  pending: boolean
  /** The agent's voice is audibly playing — mute the mic so it isn't heard. */
  speaking: boolean
  /** The agent's ask_user call is waiting for this answer — the mark's colour says it's a reply, not a new prompt. */
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
  /** No cursor while something else beside the field has the keys (a question's options), so it doesn't look focused. */
  cursorHidden?: boolean
  /** The mic switch kept by the caller, so it outlives this field being swapped for another (a question's options). */
  mic?: boolean
  onMicChange?: (mic: boolean) => void
}>) {
  const [input, setInput] = useState("")
  const [ownMic, setOwnMic] = useState(false)
  const mic = controlledMic ?? ownMic
  const setMic = onMicChange ?? setOwnMic
  const { columns } = useWindowSize()
  const history = usePromptHistory(initialHistory ?? [])
  useEffect(() => {
    onDraft?.(input)
  }, [input, onDraft])
  // Human edits (typing, dictation) reset the recall position; recalled text itself goes through plain setInput so it doesn't.
  const editInput = (value: string) => {
    history.markEdited()
    uiEvents.emit("follow")
    setInput(value)
  }

  // Ctrl+T toggles dictation (Esc quits, see useQuitGuard).
  useKey((char, key) => {
    if (key.ctrl && char === "t") setMic(!mic)
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

  const palette = usePalette()
  // An answer to the agent's question gets its mark in the success colour, so it doesn't read as a new prompt
  const prefix = paint(asking ? palette.success : palette.accent)(statusPrefix(mic, speaking, sttState))
  const windowFocused = useWindowFocus()

  const handleSubmit = (value: string) => {
    if (!value.trim() || pending) return
    history.commit(value)
    setInput("")
    send(value)
  }

  // The row's padding + the fixed 2-column prefix
  const sideChrome = 2
  const fieldColumns = Math.max(8, columns - sideChrome - PREFIX_COLS - 1)

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box width="100%" flexShrink={0} paddingX={1}>
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
          blinkPaused={!windowFocused || cursorHidden}
          placeholder={placeholder ?? t("input.placeholder")}
          prefix={prefix}
          prefixCols={PREFIX_COLS}
          columns={fieldColumns}
          maxVisibleLines={INPUT_CONTENT_LINES}
        />
      </Box>
    </Box>
  )
}
