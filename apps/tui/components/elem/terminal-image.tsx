import { Box, Text } from "ink"
import { useEffect, useLayoutEffect, useState } from "react"
import { renderTerminalImage } from "../../lib/image/render-terminal-image"
import { useRemeasure } from "./virtual-scroll"

/**
 * Renders an image inline via terminal-image (Kitty/iTerm2/ANSI-block
 * protocols, auto-detected). Shows the dim alt text while resolving, and
 * keeps showing it if rendering fails (e.g. unreachable URL) instead of
 * showing nothing.
 */
export function TerminalImage({ href, alt }: Readonly<{ href: string; alt: string }>) {
  const [rendered, setRendered] = useState<string | null>(null)
  const remeasure = useRemeasure()

  useEffect(() => {
    let cancelled = false
    setRendered(null)
    renderTerminalImage(href).then(result => {
      if (!cancelled) setRendered(result)
    })
    return () => {
      cancelled = true
    }
  }, [href])

  // The image arrives after the scroll view measured this item with only the alt text; its new height must reach it
  useLayoutEffect(() => {
    if (rendered) remeasure()
  }, [rendered, remeasure])

  return (
    <Box flexDirection="column">
      {rendered && <Text>{rendered}</Text>}
      {alt && <Text dimColor>{alt}</Text>}
    </Box>
  )
}
