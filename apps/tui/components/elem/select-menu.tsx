import { Box, Text, useInput } from "ink"
import { useState } from "react"

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
  width = 32,
  initialIndex,
  onSelect,
  onClose
}: Readonly<{
  items: string[]
  /** Dimmed note pinned to the right edge of each row, e.g. a locale's code beside its name. */
  hints?: string[]
  width?: number
  /** Option highlighted on open, for menus that re-offer a current value; defaults to the first. */
  initialIndex?: number
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
    if (next < from) setFrom(next)
    else if (next >= from + VISIBLE_COUNT) setFrom(next - VISIBLE_COUNT + 1)
  }

  useInput((_input, key) => {
    if (key.escape || key.backspace || key.delete) {
      onClose()
      return
    }
    if (key.downArrow) move(1)
    if (key.upArrow) move(-1)
    if (key.return) onSelect(focused)
  })

  return (
    <Box borderStyle="classic" width={width} borderColor="magenta" paddingLeft={1}>
      <Box flexDirection="column">
        {items.slice(from, from + VISIBLE_COUNT).map((item, offset) => {
          const index = from + offset
          const isFocused = index === focused
          const hint = hints?.[index]
          return (
            <Box
              key={index}
              // Only a row with something to push right is given a width; the rest size to their
              // content, as every menu here did before hints existed. Three columns go to the border
              // and its left padding, and a fourth keeps the hint off the right border.
              width={hint === undefined ? undefined : width - 4}
              justifyContent="space-between"
              paddingLeft={isFocused ? 0 : 2}
            >
              <Box gap={1}>
                {isFocused && <Text color="blue">❯</Text>}
                <Text color={isFocused ? "blue" : undefined}>{item}</Text>
              </Box>
              {hint !== undefined && <Text dimColor>{hint}</Text>}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
