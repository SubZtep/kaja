import { Box, type DOMElement, measureElement, Text, useWindowSize } from "ink"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { t } from "../../lib/i18n"
import { renderTerminalImage, type TerminalImageResult } from "../../lib/image/render-terminal-image"
import { useRemeasure, useViewportHeight } from "./virtual-scroll"

/** Rows the chat viewport never gets: header 1, input up to 8, key bar 1, caption 1, one spare. */
const CHROME_ROWS = 12
/** Rows of the viewport an image can't use: its caption line and the "older messages" hint. */
const VIEWPORT_SPARE_ROWS = 2
const MIN_IMAGE_ROWS = 4
const MIN_IMAGE_COLUMNS = 8
const IMAGE_WIDTH_SHARE = 0.6
const RESIZE_SETTLE_MS = 200

/** The widest an image may be: a share of the terminal, so a narrowed window never wraps its rows. */
export function maxImageColumns(terminalColumns: number): number {
  return Math.max(MIN_IMAGE_COLUMNS, Math.floor(terminalColumns * IMAGE_WIDTH_SHARE))
}

/** The tallest an image may be so it fits the chat viewport whole (a taller one makes the scroll view jump). */
export function maxImageRows(terminalRows: number): number {
  return Math.max(MIN_IMAGE_ROWS, terminalRows - CHROME_ROWS)
}

/**
 * The size an image is drawn at. The terminal alone gives a share of its width and its rows minus the chrome;
 * the real container width and viewport height, once measured (0 = unknown), can only shrink that.
 */
export function imageBox(opts: {
  terminalColumns: number
  terminalRows: number
  containerWidth: number
  viewportHeight: number
}) {
  let columns = maxImageColumns(opts.terminalColumns)
  if (opts.containerWidth > 0) columns = Math.max(MIN_IMAGE_COLUMNS, Math.min(columns, opts.containerWidth))
  let rows = maxImageRows(opts.terminalRows)
  if (opts.viewportHeight > 0)
    rows = Math.max(MIN_IMAGE_ROWS, Math.min(rows, opts.viewportHeight - VIEWPORT_SPARE_ROWS))
  return { columns, rows }
}

/**
 * Renders an image inline via terminal-image (Kitty/iTerm2/ANSI-block
 * protocols, auto-detected). Shows the dim alt text while resolving, and
 * keeps showing it if rendering fails, followed by the reason (e.g. HTTP 404)
 * so a broken link doesn't look like a missing feature.
 */
export function TerminalImage({ href, alt }: Readonly<{ href: string; alt: string }>) {
  const [result, setResult] = useState<TerminalImageResult | null>(null)
  const remeasure = useRemeasure()
  const viewportHeight = useViewportHeight()
  const { rows, columns } = useWindowSize()
  const boxRef = useRef<DOMElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const target = imageBox({ terminalColumns: columns, terminalRows: rows, containerWidth, viewportHeight })
  // Re-render only once the size has settled (a resize drag, the input growing), not on every step.
  const [settled, setSettled] = useState(target)
  const renderedHref = useRef<string | null>(null)

  // The width this item really has (indentation, nesting), known once laid out.
  useLayoutEffect(() => {
    if (!boxRef.current) return
    const { width } = measureElement(boxRef.current)
    if (width > 0 && width !== containerWidth) setContainerWidth(width)
  })

  useEffect(() => {
    const timer = setTimeout(() => setSettled(target), RESIZE_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [target.columns, target.rows])

  useEffect(() => {
    let cancelled = false
    // A resize keeps the old picture up until the resized one is ready.
    if (renderedHref.current !== href) setResult(null)
    renderedHref.current = href
    void renderTerminalImage(href, { width: settled.columns, height: settled.rows }).then(next => {
      if (!cancelled) setResult(next)
    })
    return () => {
      cancelled = true
    }
  }, [href, settled.columns, settled.rows])

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
    <Box ref={boxRef} flexDirection="column" width="100%">
      {result && "image" in result && <Text>{result.image}</Text>}
      {caption && <Text dimColor>{caption}</Text>}
    </Box>
  )
}
