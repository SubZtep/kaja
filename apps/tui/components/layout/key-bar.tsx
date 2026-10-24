import { Box, type DOMElement, Text, useBoxMetrics } from "ink"
import { useCallback, useEffect, useRef, useState } from "react"
import { useInputBlocked } from "../../hooks/use-input-blocked"
import { useTerminalReports } from "../../hooks/use-terminal-reports"
import { parseMouse } from "../../lib/terminal-input"
import { useKajaTheme } from "../theme"

/** `lit` while the modifier of its hotkey is held; `short` is the key's compact form, `droppable` entries go first. */
export type KeyBarEntry = {
  key: string
  label: string
  onPress?: () => void
  lit?: boolean
  short?: string
  droppable?: boolean
}

type Rect = { left: number; top: number; width: number; height: number }

const SEPARATOR = " · "
// Like the setup screens' hint line: from column 2, never past column 78
const MAX_COLUMN = 78

const rowWidth = (items: KeyBarEntry[]) =>
  items.reduce(
    (sum, item, index) =>
      sum + (index > 0 ? SEPARATOR.length : 0) + Bun.stringWidth(item.key) + 1 + Bun.stringWidth(item.label),
    0
  )

/** The columns the bar has at this terminal width. */
export function keyBarRoom(columns: number): number {
  return Math.min(MAX_COLUMN, columns) - 1
}

/** Squeezes the bar onto one row when `width` is short: compact keys first, then without the droppable entries. */
export function fitKeyBarItems(items: KeyBarEntry[], width: number): KeyBarEntry[] {
  if (rowWidth(items) <= width) return items
  const compact = items.map(item => (item.short ? { ...item, key: item.short } : item))
  if (rowWidth(compact) <= width) return compact
  return compact.filter(item => !item.droppable)
}

function KeyBarItem({
  item,
  hovered,
  onRect,
  onGone
}: Readonly<{
  item: KeyBarEntry
  hovered: boolean
  onRect: (key: string, rect: Rect) => void
  onGone: (key: string) => void
}>) {
  const { accent } = useKajaTheme()
  const ref = useRef<DOMElement>(null)
  const { left, top, width, height } = useBoxMetrics(ref)
  useEffect(() => onRect(item.key, { left, top, width, height }), [item.key, left, top, width, height, onRect])
  // A dropped or renamed entry must not stay clickable at its old spot
  useEffect(() => () => onGone(item.key), [item.key, onGone])
  return (
    <Box ref={ref} flexShrink={0} columnGap={1}>
      <Text {...(item.lit ? { ...accent(), bold: true } : {})}>{item.key}</Text>
      <Text dimColor={!hovered} bold={hovered}>
        {item.label}
      </Text>
    </Box>
  )
}

/**
 * Bottom-of-screen key line in the setup screens' hint style: `<key> <action>` pairs, the key plain (in the accent
 * while its modifier is held) and the action dim, joined by a dim "·", on one row within column 78. On a narrow
 * terminal (`width`) the keys shrink to their `short` form and the `droppable` entries disappear; what still doesn't
 * fit is cut off at the end. An entry with `onPress` is also a button: its action brightens under the mouse and a click
 * runs it.
 */
export function KeyBar({ items: allItems, width }: Readonly<{ items: KeyBarEntry[]; width?: number }>) {
  const items = width === undefined ? allItems : fitKeyBarItems(allItems, keyBarRoom(width))
  const barRef = useRef<DOMElement>(null)
  const bar = useBoxMetrics(barRef)
  const rects = useRef(new Map<string, Rect>())
  const [hovered, setHovered] = useState<string | null>(null)
  const onRect = useCallback((key: string, rect: Rect) => {
    rects.current.set(key, rect)
  }, [])
  const onGone = useCallback((key: string) => {
    rects.current.delete(key)
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

  const blocked = useInputBlocked()
  useTerminalReports(input => {
    const mouse = parseMouse(input)
    if (!mouse) return
    const item = hit(mouse.col, mouse.row)
    if (mouse.kind === "move") setHovered(item?.key ?? null)
    else item?.onPress?.()
  }, !blocked)

  return (
    <Box
      ref={barRef}
      flexShrink={0}
      paddingLeft={1}
      height={1}
      overflow="hidden"
      {...(width === undefined ? {} : { width: keyBarRoom(width) + 1 })}
    >
      {/* Siblings, not wrappers: an item's measured position must be relative to the bar for the hit test */}
      {items.flatMap((item, index) => [
        ...(index > 0
          ? [
              <Box key={`sep:${item.key}`} flexShrink={0}>
                <Text dimColor>{SEPARATOR}</Text>
              </Box>
            ]
          : []),
        <KeyBarItem key={item.key} item={item} hovered={hovered === item.key} onRect={onRect} onGone={onGone} />
      ])}
    </Box>
  )
}
