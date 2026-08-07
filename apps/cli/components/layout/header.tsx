import { defaultTheme, extendTheme, Spinner, ThemeProvider } from "@inkjs/ui"
import { titleCase } from "@kaja/shared"
import { Box, Text, type TextProps } from "ink"
import Gradient from "ink-gradient"
import { useRandomSpinner } from "../../hooks/use-random-spinner"
import { describeToolCall } from "../../lib/agent/tool-labels"
import { MonsterMate } from "./monster"

const customTheme = extendTheme(defaultTheme, {
  components: {
    Spinner: {
      styles: {
        label: (): TextProps => ({
          color: "green",
          dimColor: true
        })
      }
    }
  }
})

/**
 * Live top bar: current persona on the left; on the right, in-flight tool
 * activity, or the active model name (+ prompt tokens when known).
 *
 * `width` must be the full terminal width so `space-between` has a real
 * track to lay out against — without it Ink can collapse the row and the
 * model/tokens slot never paints.
 */
export function Header({
  persona,
  model,
  provider,
  promptTokens,
  currentTool,
  width
}: Readonly<{
  persona: string
  model: string
  /** Provider name shown after the model, e.g. "fireworks" → "Fireworks". */
  provider?: string
  promptTokens: number | null
  currentTool?: { name: string; arguments: string }
  /** Terminal columns (from useWindowSize). */
  width: number
}>) {
  const tokensSuffix = promptTokens != null ? ` · ${promptTokens.toLocaleString()} tokens` : ""
  const spinnerType = useRandomSpinner(!!currentTool, "block")

  return (
    <Box width={width} flexShrink={0} justifyContent="space-between" paddingX={1} gap={1}>
      <Box gap={1} flexShrink={1} flexGrow={0} minWidth={0} overflow="hidden">
        <MonsterMate />
        <Box overflow="hidden" flexShrink={1} minWidth={0}>
          <Gradient name="rainbow">
            <Text wrap="truncate-end">{persona}</Text>
          </Gradient>
        </Box>
      </Box>
      {currentTool ? (
        <Box flexShrink={1} flexGrow={0} gap={1} overflow="hidden" minWidth={0}>
          <ThemeProvider theme={customTheme}>
            <Spinner type={spinnerType} label={describeToolCall(currentTool.name, currentTool.arguments)} />
          </ThemeProvider>
        </Box>
      ) : (
        <Box flexShrink={0} flexGrow={0}>
          <Text color="gray">
            {titleCase(model)}
            {provider ? <Text dimColor> {titleCase(provider)}</Text> : null}
            {tokensSuffix}
          </Text>
        </Box>
      )}
    </Box>
  )
}
