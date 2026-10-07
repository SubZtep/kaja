import { Box, Text, useInput } from "ink"
import { useState } from "react"
import { useKajaTheme } from "../theme"
import { InputFrame } from "./rail"

const VISIBLE_COUNT = 5

/**
 * Keyboard-driven selection list: up/down to move, return to pick, escape
 * (or backspace/delete) to dismiss.
 *
 * Rendered directly rather than through @inkjs/ui's `Select`, which can't open on a
 * given option: its `defaultValue` seeds the internal value but leaves the highlight on
 * the first option, so returning on it either never fires (the value never changed) or
 * reports whichever option is highlighted instead. Keys, the scroll window and the
 * stop-at-either-end movement match what `Select` did, so the other callers behave as before.
 */
export function SelectMenu({
  items,
  hints,
  accented,
  width = 32,
  initialIndex,
  preview,
  closeOnBackspace = true,
  onFocus,
  onSelect,
  onClose
}: Readonly<{
  items: string[]
  /** Dimmed note pinned to the right edge of each row, e.g. a locale's code beside its name. */
  hints?: string[]
  /** Rows drawn in the accent colour while not focused, e.g. your own personas in the persona picker. */
  accented?: boolean[]
  width?: number
  /** Option highlighted on open, for menus that re-offer a current value; defaults to the first. */
  initialIndex?: number
  /** The highlighted row in the theme's preview colours, a band across the menu: the theme step's, which previews itself. */
  preview?: boolean
  /** Backspace/Delete dismiss like Escape; off where dismissing throws away more than this menu (the setup wizard). */
  closeOnBackspace?: boolean
  /** Called as the highlight moves, e.g. to preview the option under it. */
  onFocus?: (index: number) => void
  onSelect: (index: number) => void
  onClose: () => void
}>) {
  const start = Math.min(Math.max(initialIndex ?? 0, 0), Math.max(items.length - 1, 0))
  // Scrolls only far enough to keep the focused option on screen, so opening deep in a long list still shows it.
  const windowStart = Math.max(0, Math.min(start - VISIBLE_COUNT + 1, items.length - VISIBLE_COUNT))
  const [focused, setFocused] = useState(start)
  const [from, setFrom] = useState(windowStart)

  // A caller that swaps the list in place (the setup wizard reuses one menu for every step) would
  // otherwise keep the previous step's highlight. `Select` reset itself the same way.
  const [lastItems, setLastItems] = useState(items)
  if (items !== lastItems && items.join("\u0000") !== lastItems.join("\u0000")) {
    setLastItems(items)
    setFocused(start)
    setFrom(windowStart)
  }

  function move(delta: number) {
    const next = focused + delta
    // No wrapping at either end, matching the list this replaces.
    if (next < 0 || next >= items.length) return
    setFocused(next)
    onFocus?.(next)
    if (next < from) setFrom(next)
    else if (next >= from + VISIBLE_COUNT) setFrom(next - VISIBLE_COUNT + 1)
  }

  useInput((_input, key) => {
    if (key.escape || (closeOnBackspace && (key.backspace || key.delete))) {
      onClose()
      return
    }
    if (key.downArrow) move(1)
    if (key.upArrow) move(-1)
    if (key.return) onSelect(focused)
  })

  const { accent, previewRow, previewText } = useKajaTheme()

  return (
    // No background and no colour change: the highlighted row is marked by "❯" and bold alone, on any theme (only
    // `preview` paints it, in the theme's own colours).
    <InputFrame width={width} plain>
      {items.slice(from, from + VISIBLE_COUNT).map((item, offset) => {
        const index = from + offset
        const isFocused = index === focused
        const hint = hints?.[index]
        const accentRow = !isFocused && accented?.[index]
        return (
          <Box
            key={index}
            // A row with a hint is the menu's width, so the hint sits at its right edge, and a preview band at least that
            // wide; the rest size to their content.
            width={hint === undefined ? undefined : width}
            minWidth={isFocused && preview ? width : undefined}
            justifyContent="space-between"
            paddingLeft={isFocused ? 0 : 2}
            {...(isFocused && preview ? previewRow() : {})}
          >
            <Box gap={1}>
              {isFocused && (
                <Text bold {...(preview ? previewText() : {})}>
                  ❯
                </Text>
              )}
              <Text bold={isFocused} {...(accentRow ? accent() : {})} {...(isFocused && preview ? previewText() : {})}>
                {item}
              </Text>
            </Box>
            {hint !== undefined && <Text dimColor>{hint}</Text>}
          </Box>
        )
      })}
    </InputFrame>
  )
}
