import type { PersonaModels } from "@kaja/schema/cli"
import { Box, useApp, useInput, useWindowSize } from "ink"
import { useEffect, useState } from "react"
import { useBlink } from "../../hooks/use-blink"
import { useDictation } from "../../hooks/use-dictation"
import { usePromptHistory } from "../../hooks/use-prompt-history"
import { useWindowFocus } from "../../hooks/use-window-focus"
import { t } from "../../lib/i18n"
import { TextInput } from "../elem/text-input"

/**
 * Outer box max rows (padding/border included). Content lines for the field
 * leave room for SolidBorder padding (1+1) or PowerBorder edges (~1+1).
 */
const INPUT_MAX_HEIGHT = 8
const INPUT_CONTENT_LINES = 6
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
  const [idle, setIdle] = useState(0)
  const [mic, setMic] = useState(false)
  const { columns } = useWindowSize()
  const { exit } = useApp()
  const history = usePromptHistory(initialHistory ?? [])
  // Human edits (typing, dictation) reset the recall position; recalled text itself goes through plain setInput so it doesn't.
  const editInput = (value: string) => {
    history.markEdited()
    setInput(value)
  }

  // Ctrl+T toggles dictation; Esc quits.
  useInput((char, key) => {
    if (key.ctrl && char === "t") setMic(prev => !prev)
    if (key.escape) exit()
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
  const cursorVisible = useBlink(500, !mic && !pending && windowFocused)

  useEffect(() => {
    const timer = setInterval(() => {
      setIdle(idle => idle + 1)
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    setIdle(0)
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
      <Border variant={idle > 30 ? "power" : "solid"}>
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
          cursorVisible={cursorVisible}
          placeholder={idle > 20 ? undefined : t("input.placeholder")}
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

  const boxProps: any = {
    backgroundColor: "#224",
    borderColor: "magenta",
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
    boxProps.borderColor = "green"
    boxProps.borderLeftDimColor = true
    boxProps.borderRightDimColor = true
  }

  return <Box {...boxProps}>{children}</Box>
}
