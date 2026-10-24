import { Box, Text } from "ink"
import { useState } from "react"
import { useKey } from "../../hooks/use-key"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { InputFrame } from "./rail"
import { FilterLine, matchesFilter, useFilter } from "./use-filter"

/**
 * Keyboard-driven selection list: up/down to move, return to pick, escape (or backspace/delete) to dismiss. With
 * `filterable`, typing narrows the rows (see {@link useFilter}); `onSelect` still gets the index in `items`.
 *
 * Rendered directly rather than through @inkjs/ui's `Select`, which can't open on a given option: its `defaultValue`
 * seeds the internal value but leaves the highlight on the first option, so returning on it either never fires (the
 * value never changed) or reports whichever option is highlighted instead. Keys, the scroll window and the
 * stop-at-either-end movement match what `Select` did, so the other callers behave as before.
 */
export function SelectMenu({
  items,
  hints,
  accented,
  width = 32,
  initialIndex,
  visibleCount = 5,
  preview,
  closeOnBackspace = true,
  filterable = false,
  active = true,
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
  /** Rows shown at once, the list scrolling past that; defaults to all of them. */
  visibleCount?: number
  /**
   * The highlighted row in the theme's preview colours, a band across the menu: the theme step's, which previews
   * itself.
   */
  preview?: boolean
  /** Backspace/Delete dismiss like Escape; off where dismissing throws away more than this menu (the setup wizard). */
  closeOnBackspace?: boolean
  /** Typing filters the rows: for a list too long to scroll through, like every model a provider serves. */
  filterable?: boolean
  /** Takes keys; off while something else (a text field beside it) has them, and the rows dim to show it. */
  active?: boolean
  /** Called as the highlight moves, e.g. to preview the option under it. */
  onFocus?: (index: number) => void
  onSelect: (index: number) => void
  /** Left out inside a Modal, which closes on Escape itself. */
  onClose?: () => void
}>) {
  const filter = useFilter(filterable)
  // The rows on show, as indexes into `items`; `focused` and `from` are positions in this list
  const shown = items.flatMap((item, index) => (matchesFilter(item, filter.query) ? [index] : []))
  const visible = visibleCount === undefined ? items.length : Math.max(visibleCount, 1)
  const start = Math.min(Math.max(initialIndex ?? 0, 0), Math.max(items.length - 1, 0))
  // Scrolls only far enough to keep the focused option on screen, so opening deep in a long list still shows it.
  const windowStart = Math.max(0, Math.min(start - visible + 1, items.length - visible))
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
    if (next < 0 || next >= shown.length) return
    setFocused(next)
    onFocus?.(shown[next]!)
    if (next < from) setFrom(next)
    else if (next >= from + visible) setFrom(next - visible + 1)
  }

  useKey(
    (input, key) => {
      // A new filter starts the highlight over at its first match
      if (filter.handle(input, key)) {
        setFocused(0)
        setFrom(0)
        return
      }
      if (key.escape || (closeOnBackspace && (key.backspace || key.delete))) {
        onClose?.()
        return
      }
      if (key.downArrow) move(1)
      if (key.upArrow) move(-1)
      if (key.return && shown[focused] !== undefined) onSelect(shown[focused])
    },
    { isActive: active }
  )

  const { accent, previewRow, previewText } = useKajaTheme()

  // A scrolling list reserves an arrow slot between the cursor and the label, so the menu stays `visible` rows tall.
  const scrolls = shown.length > visible
  const hiddenAbove = from
  const hiddenBelow = Math.max(0, shown.length - from - visible)

  return (
    // No background and no colour change: the highlighted row is marked by "❯" and bold alone, on any theme (only
    // `preview` paints it, in the theme's own colours).
    <InputFrame width={width} plain>
      {filterable && <FilterLine query={filter.query} />}
      {shown.length === 0 && <Text dimColor>{t("menu.noMatches")}</Text>}
      {shown.slice(from, from + visible).map((index, offset) => {
        const item = items[index]!
        const isFocused = from + offset === focused
        const hint = hints?.[index]
        const accentRow = !isFocused && accented?.[index]
        let arrow = " "
        if (offset === 0 && hiddenAbove > 0) arrow = "↑"
        else if (offset === visible - 1 && hiddenBelow > 0) arrow = "↓"
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
                <Text bold dimColor={!active} {...(preview ? previewText() : {})}>
                  ❯
                </Text>
              )}
              {scrolls && <Text dimColor>{arrow}</Text>}
              <Text
                bold={isFocused}
                dimColor={!active}
                {...(accentRow ? accent() : {})}
                {...(isFocused && preview ? previewText() : {})}
              >
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
