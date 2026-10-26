import { Box, type DOMElement } from "ink"
import { type ReactNode, useRef, useState } from "react"
import { useClick } from "../../hooks/use-click"
import { copyToClipboard } from "../../lib/copy"
import { useKajaTheme } from "../theme"

/**
 * Wraps a timeline block (an agent message, a question) in a hover tint; a click copies `text`. No layout of its own,
 * so it never shifts the dot/indent columns other blocks rely on.
 */
export function CopyableBlock({ text, children }: Readonly<{ text: string; children: ReactNode }>) {
  const ref = useRef<DOMElement>(null)
  const [hovered, setHovered] = useState(false)
  const theme = useKajaTheme()
  useClick(ref, () => copyToClipboard(text), setHovered)
  return (
    <Box ref={ref} {...theme.hoverTint(hovered)} width="100%">
      {children}
    </Box>
  )
}
