import { Box, Text } from "ink"
import { useKajaTheme } from "../theme"

const LEAD = "── "

/** The chat frame's dim dashed line across `width` columns, inside the screen's one-column margins. */
export function DashedRule({ width }: Readonly<{ width: number }>) {
  return (
    <Box flexShrink={0} paddingX={1} height={1}>
      <Text dimColor>{"╌".repeat(Math.max(0, width - 2))}</Text>
    </Box>
  )
}

/** "── <title> ────": the title in the accent between dim rules, `width` columns in all. */
export function TitleRule({ title, width }: Readonly<{ title: string; width: number }>) {
  const { accent } = useKajaTheme()
  const tail = Math.max(1, width - Bun.stringWidth(LEAD) - Bun.stringWidth(title) - 1)
  return (
    <Box height={1} overflow="hidden">
      <Text wrap="truncate-end">
        <Text dimColor>{LEAD}</Text>
        <Text {...accent()}>{title}</Text>
        <Text dimColor>{` ${"─".repeat(tail)}`}</Text>
      </Text>
    </Box>
  )
}
