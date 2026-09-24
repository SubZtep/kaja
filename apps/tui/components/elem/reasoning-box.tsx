import { Box, Text } from "ink"
import { useKajaTheme } from "../theme"
import Markdown from "./markdown"

/** The dim-bordered magenta box the model's reasoning is rendered in. */
export function ReasoningBox({ children }: Readonly<{ children: string }>) {
  const { reasoningBox, reasoningText } = useKajaTheme()
  return (
    <Box {...reasoningBox()} borderStyle="singleDouble" paddingX={1}>
      <Text {...reasoningText()}>
        <Markdown>{children}</Markdown>
      </Text>
    </Box>
  )
}
