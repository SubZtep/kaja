import { type SpinnerProps, useComponentTheme, useSpinner } from "@inkjs/ui"
import { Box, Text, type TextProps } from "ink"
import { useEffect, useState } from "react"
import type { PartialMessage } from "../hooks/use-agent"
import { useRandomSpinner } from "../hooks/use-random-spinner"
import { describeToolCall } from "../lib/agent/tool-labels"
import { t } from "../lib/i18n"
import { useKajaTheme } from "./theme"

const TICK_MS = 120

/** Rough token estimate from streamed text (~4 characters per token). */
function estimateTokens(partial: PartialMessage | null) {
  if (!partial) return 0
  return Math.round((partial.reasoning.length + partial.content.length) / 4)
}

/**
 * Activity line shown while a run is in flight but nothing is visibly
 * streaming — i.e. before the first token, or while reasoning streams with
 * the thinking display off. A spinner plus elapsed time and a rough token
 * count, so the terminal never looks stuck.
 */
export function Activity({
  pending,
  partial,
  thinking,
  tool
}: Readonly<{
  pending: boolean
  partial: PartialMessage | null
  thinking: boolean
  /** The tool call in flight; shown in place of the thinking line (minimal `toolDisplay`). */
  tool?: { name: string; arguments: string }
}>) {
  const [tick, setTick] = useState(0)
  const spinnerType = useRandomSpinner(pending, "dots")
  const { thinkingLabel, toolLabel } = useKajaTheme()
  useEffect(() => {
    if (!pending) return
    setTick(0)
    const timer = setInterval(() => setTick(t => t + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [pending])

  const contentVisible = !!partial?.content
  const reasoningVisible = thinking && !!partial?.reasoning
  if (!pending || contentVisible || reasoningVisible) return null

  if (tool) {
    return <SpinnerLine type={spinnerType} label={describeToolCall(tool.name, tool.arguments)} style={toolLabel()} />
  }

  const seconds = Math.floor((tick * TICK_MS) / 1000)
  const tokens = estimateTokens(partial)

  return (
    <SpinnerLine
      type={spinnerType}
      label={`${t("activity.thinking", { seconds })}${tokens ? t("activity.tokens", { tokens }) : ""}`}
      style={thinkingLabel()}
    />
  )
}

/**
 * ink-ui's Spinner, laid out so a long label can't squeeze the frame: the frame keeps its width, then a space, then
 * the label on one row; a one-column frame puts the label in the column the agent's messages start in.
 */
function SpinnerLine({
  type,
  label,
  style
}: Readonly<{ type: SpinnerProps["type"]; label: string; style: TextProps }>) {
  const { frame } = useSpinner({ type })
  const { styles } = useComponentTheme<{ styles: { frame: () => TextProps } }>("Spinner")
  return (
    <Box>
      <Box flexShrink={0} marginRight={1}>
        <Text {...styles.frame()}>{frame}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text {...style} wrap="truncate-end">
          {label}
        </Text>
      </Box>
    </Box>
  )
}
