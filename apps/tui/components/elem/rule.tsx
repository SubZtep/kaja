import { Box, Text } from "ink"

/** The chat frame's dim dashed line across `width` columns, inside the screen's one-column margins. */
export function DashedRule({ width }: Readonly<{ width: number }>) {
  return (
    <Box flexShrink={0} paddingX={1} height={1}>
      <Text dimColor>{"╌".repeat(Math.max(0, width - 2))}</Text>
    </Box>
  )
}
