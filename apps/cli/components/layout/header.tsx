import { defaultTheme, extendTheme, Spinner, ThemeProvider } from "@inkjs/ui"
import { Box, Text, type TextProps } from "ink"
import Gradient from "ink-gradient"
import { describeToolCall } from "../../lib/agent/tool-labels"
import { MonsterMate } from "../monster"

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
 * Shorten path-style model ids for the top bar (`org/team/name` → `name`)
 * so free-chat / Fireworks-style ids stay readable. Plain ids are unchanged.
 */
export function shortModelLabel(model: string): string {
  const slash = model.lastIndexOf("/")
  return slash >= 0 ? model.slice(slash + 1) : model
}

/**
 * Live top bar: current persona, and the right-hand slot which shows
 * in-flight tool activity, falling back to the active model name while idle
 * (request model, or free-chat's x-kaja-model once a reply has landed).
 */
export function Header({
  persona,
  model,
  promptTokens,
  currentTool
}: Readonly<{
  persona: string
  model: string
  promptTokens: number | null
  currentTool?: { name: string; arguments: string }
}>) {
  const modelLabel = shortModelLabel(model)
  return (
    <Box flexShrink={0} justifyContent="space-between" paddingX={1}>
      <Box gap={1} flexShrink={1} overflow="hidden">
        <MonsterMate />
        <Box overflow="hidden">
          <Gradient name="rainbow">
            <Text wrap="truncate-end">{persona}</Text>
          </Gradient>
        </Box>
      </Box>
      {currentTool ? (
        <Box flexShrink={1} gap={1} overflow="hidden">
          <ThemeProvider theme={customTheme}>
            <Spinner type="boxBounce" label={describeToolCall(currentTool.name, currentTool.arguments)} />
          </ThemeProvider>
        </Box>
      ) : (
        <Box flexShrink={0}>
          <Text color="grey" dimColor wrap="truncate-end">
            {modelLabel}
            {promptTokens != null ? ` · ${promptTokens.toLocaleString()} tokens` : ""}
          </Text>
        </Box>
      )}
    </Box>
  )
}
