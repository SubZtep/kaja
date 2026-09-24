import { StatusMessage, type StatusMessageProps } from "@inkjs/ui"
import { Box, renderToString } from "ink"

// Piped output isn't wrapped, so a long error stays on one greppable line
const UNWRAPPED_COLUMNS = 1000

/** One indented report line as ink-ui's StatusMessage draws it (coloured icon, then the text), for printing with console.log. */
export function statusLine(variant: StatusMessageProps["variant"], text: string, indent = 2): string {
  const columns = process.stdout.isTTY ? (process.stdout.columns ?? 80) : UNWRAPPED_COLUMNS
  return renderToString(
    <Box paddingLeft={indent}>
      <StatusMessage variant={variant}>{text}</StatusMessage>
    </Box>,
    { columns }
  )
}
