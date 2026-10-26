import { pathToFileURL } from "node:url"
import { Box, type DOMElement, Text, useWindowSize } from "ink"
import { useRef, useState } from "react"
import { t } from "../../lib/i18n"
import { openImage } from "../../lib/image/open-image"
import { sourceName } from "../../lib/image/source"
import { useKajaTheme } from "../theme"
import { TerminalImage } from "./terminal-image"
import { useClick } from "./use-click"

/** Below this many columns the text goes under the image: beside it, it would wrap to a few words a line. */
const IMAGE_ROW_MIN_COLUMNS = 100

/** An OSC 8 link: terminals that know it open `target` on click; a local path becomes a file:// URL. */
const terminalLink = (text: string, target: string) => {
  const url = /^[a-z]+:/i.test(target) ? target : pathToFileURL(target).href
  return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`
}

// "↗ open": a click opens the image in the system's viewer; when nothing could, the plain link shows instead.
function OpenLink({ target }: Readonly<{ target: string }>) {
  const { accent, muted } = useKajaTheme()
  const ref = useRef<DOMElement>(null)
  const [failed, setFailed] = useState(false)
  useClick(ref, () => {
    void openImage(target).then(opened => setFailed(!opened))
  })
  return (
    <Box ref={ref} flexDirection="column">
      <Text {...accent()}>{terminalLink(`↗ ${t("timeline.openImage")}`, target)}</Text>
      {failed && <Text {...muted()}>{terminalLink(target, target)}</Text>}
    </Box>
  )
}

/**
 * A tool's image with what it shows (its alt text, then its description once written), where it came from and a way
 * to open it: beside the picture on a wide terminal, under it on a narrow one.
 */
export function ImageRow({
  path,
  text,
  source
}: Readonly<{ path: string; text?: string; source?: { url?: string; fileName?: string } }>) {
  const { columns } = useWindowSize()
  const { muted } = useKajaTheme()
  const wide = columns >= IMAGE_ROW_MIN_COLUMNS
  // A data URL has nothing to open; a stored file or a URL does.
  const target = path.startsWith("data:") ? undefined : path
  const from = sourceName(source)
  return (
    <Box flexDirection={wide ? "row" : "column"} columnGap={2}>
      <Box flexShrink={0} width={wide ? "60%" : "100%"}>
        <TerminalImage href={path} alt="" />
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {text && <Text {...muted()}>{text}</Text>}
        {from && <Text {...muted()}>{source?.url ? terminalLink(from, source.url) : from}</Text>}
        {target && <OpenLink target={target} />}
      </Box>
    </Box>
  )
}
