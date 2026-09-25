import { Spinner, ThemeProvider } from "@inkjs/ui"
import { titleCase } from "@kaja/shared"
import { Box, Text } from "ink"
import { useRandomSpinner } from "../../hooks/use-random-spinner"
import { describeToolCall } from "../../lib/agent/tool-labels"
import { useKajaTheme, useSpinnerTheme } from "../theme"
import { MonsterMate } from "./monster"

/**
 * Live top bar: current persona on the left; on the right, in-flight tool
 * activity, or the active model name (+ prompt tokens when known).
 *
 * `width` must be the full terminal width so `space-between` has a real
 * track to lay out against — without it Ink can collapse the row and the
 * model/tokens slot never paints.
 */
const compact = new Intl.NumberFormat(undefined, { notation: "compact" })

/** " · 12,345 tokens", or " · 12,345 / 33K tokens (38%)" once the window is known. */
export function tokensLabel(promptTokens: number | null, contextWindow?: number | null): string {
  if (promptTokens == null) return ""
  if (!contextWindow) return ` · ${promptTokens.toLocaleString()} tokens`
  const percent = Math.round((promptTokens / contextWindow) * 100)
  return ` · ${promptTokens.toLocaleString()} / ${compact.format(contextWindow)} tokens (${percent}%)`
}

export function Header({
  persona,
  model,
  provider,
  promptTokens,
  contextWindow,
  currentTool,
  width
}: Readonly<{
  persona: string
  model: string
  /** Provider name shown after the model, e.g. "fireworks" → "Fireworks". */
  provider?: string
  promptTokens: number | null
  /** The model's context window, when known, so the count reads as how full it is. */
  contextWindow?: number | null
  currentTool?: { name: string; arguments: string }
  /** Terminal columns (from useWindowSize). */
  width: number
}>) {
  const tokensSuffix = tokensLabel(promptTokens, contextWindow)
  const spinnerType = useRandomSpinner(!!currentTool, "block")
  const { muted, accent } = useKajaTheme()
  const spinnerTheme = useSpinnerTheme("toolLabel")

  return (
    <Box width={width} flexShrink={0} justifyContent="space-between" paddingX={1} gap={1}>
      <Box gap={1} flexShrink={1} flexGrow={0} minWidth={0} overflow="hidden">
        <MonsterMate />
        <Box overflow="hidden" flexShrink={1} minWidth={0}>
          <Text {...accent()} wrap="truncate-end">
            {persona}
          </Text>
        </Box>
      </Box>
      {currentTool ? (
        <Box flexShrink={1} flexGrow={0} gap={1} overflow="hidden" minWidth={0}>
          <ThemeProvider theme={spinnerTheme}>
            <Spinner type={spinnerType} label={describeToolCall(currentTool.name, currentTool.arguments)} />
          </ThemeProvider>
        </Box>
      ) : (
        <Box flexShrink={0} flexGrow={0}>
          <Text {...muted()}>
            {titleCase(model)}
            {provider ? <Text dimColor> {titleCase(provider)}</Text> : null}
            {tokensSuffix}
          </Text>
        </Box>
      )}
    </Box>
  )
}
