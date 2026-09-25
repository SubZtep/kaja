import { Box, Text } from "ink"
import { useEffect, useLayoutEffect, useState } from "react"
import { t } from "../../lib/i18n"
import { renderTerminalImage, type TerminalImageResult } from "../../lib/image/render-terminal-image"
import { useRemeasure } from "./virtual-scroll"

/**
 * Renders an image inline via terminal-image (Kitty/iTerm2/ANSI-block
 * protocols, auto-detected). Shows the dim alt text while resolving, and
 * keeps showing it if rendering fails, followed by the reason (e.g. HTTP 404)
 * so a broken link doesn't look like a missing feature.
 */
export function TerminalImage({ href, alt }: Readonly<{ href: string; alt: string }>) {
  const [result, setResult] = useState<TerminalImageResult | null>(null)
  const remeasure = useRemeasure()

  useEffect(() => {
    let cancelled = false
    setResult(null)
    renderTerminalImage(href).then(next => {
      if (!cancelled) setResult(next)
    })
    return () => {
      cancelled = true
    }
  }, [href])

  // The image arrives after the scroll view measured this item with only the alt text; its new height must reach it
  useLayoutEffect(() => {
    if (result) remeasure()
  }, [result, remeasure])

  let caption = alt
  if (result && "error" in result) {
    const failed = t("timeline.imageFailed", { reason: result.error })
    caption = alt ? `${alt} (${failed})` : failed
  }

  return (
    <Box flexDirection="column">
      {result && "image" in result && <Text>{result.image}</Text>}
      {caption && <Text dimColor>{caption}</Text>}
    </Box>
  )
}
