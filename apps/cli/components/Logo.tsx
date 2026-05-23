import { Text } from "ink"
import { dimgrey, teal } from "../lib/colors"
import { version } from "../package.json"

export function Logo() {
  const logo = [
    `${teal}▖▖   ▘  ▄▖▄▖`,
    `${teal}▙▘▀▌ ▌▀▌▐ ▌▌`,
    `${teal}▌▌█▌ ▌█▌▟▖▙▌`,
    `${teal}    ▙▌${dimgrey}v${version}`
  ].join("\n")

  return (
    <>
      <Text>{logo}</Text>
      <Text>{"\n"}</Text>
    </>
  )
}
