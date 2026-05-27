import { Box, Text } from "ink"
import { version } from "../../package.json"

export function Logo() {
  const teal = Bun.color("#008080", "ansi")
  const dimgrey = Bun.color("#6969", "ansi")
  const logo = [
    `${teal}▖▖   ▘  ▄▖▄▖`,
    `${teal}▙▘▀▌ ▌▀▌▐ ▌▌`,
    `${teal}▌▌█▌ ▌█▌▟▖▙▌`,
    `${teal}    ▙▌${dimgrey}v${version}`
  ].join("\n")

  return (
    <Box marginY={1}>
      <Text>{logo}</Text>
    </Box>
  )
}
