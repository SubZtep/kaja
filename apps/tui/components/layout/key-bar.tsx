import { Box, type DOMElement, Text, useBoxMetrics } from "ink"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTerminalReports } from "../../hooks/use-terminal-reports"
import { parseMouse } from "../../lib/terminal-input"
import { useKajaTheme } from "../theme"

export type KeyBarEntry = { key: string; label: string; onPress?: () => void }

type Rect = { left: number; top: number; width: number; height: number }

function KeyBarItem({
  item,
  hovered,
  onRect
}: Readonly<{ item: KeyBarEntry; hovered: boolean; onRect: (key: string, rect: Rect) => void }>) {
  const { keyCap } = useKajaTheme()
  const ref = useRef<DOMElement>(null)
  const { left, top, width, height } = useBoxMetrics(ref)
  useEffect(() => onRect(item.key, { left, top, width, height }), [item.key, left, top, width, height, onRect])
  return (
    <Box ref={ref} marginRight={2} flexShrink={0}>
      <Text {...keyCap()} dimColor={hovered}>
        {item.key}
      </Text>
      <Text dimColor={hovered}> {item.label}</Text>
    </Box>
  )
}

/**
 * Bottom-of-screen key bar, nano/Midnight-Commander style: a row of
 * `<key> <label>` pairs, the key in reverse video. On a narrow terminal the
 * pairs wrap onto further rows whole, never split mid-label.
 * An entry with `onPress` is also a button: it dims under the mouse and a click runs it.
 */
export function KeyBar({ items }: Readonly<{ items: KeyBarEntry[] }>) {
  const barRef = useRef<DOMElement>(null)
  const bar = useBoxMetrics(barRef)
  const rects = useRef(new Map<string, Rect>())
  const [hovered, setHovered] = useState<string | null>(null)
  const onRect = useCallback((key: string, rect: Rect) => {
    rects.current.set(key, rect)
  }, [])

  // Items' positions are relative to the bar, which sits at the bottom of the screen
  const hit = (col: number, row: number) =>
    items.find(item => {
      const r = rects.current.get(item.key)
      return (
        item.onPress &&
        r &&
        col >= bar.left + r.left &&
        col < bar.left + r.left + r.width &&
        row >= bar.top + r.top &&
        row < bar.top + r.top + r.height
      )
    })

  useTerminalReports(input => {
    const mouse = parseMouse(input)
    if (!mouse) return
    const item = hit(mouse.col, mouse.row)
    if (mouse.kind === "move") setHovered(item?.key ?? null)
    else item?.onPress?.()
  })

  return (
    <Box ref={barRef} flexShrink={0} width="100%" flexWrap="wrap">
      {items.map(item => (
        <KeyBarItem key={item.key} item={item} hovered={hovered === item.key} onRect={onRect} />
      ))}
    </Box>
  )
}
