import { Box, Text } from "ink"
import { useState } from "react"
import { useKey } from "../../hooks/use-key"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { InputFrame } from "./rail"
import { FilterLine, matchesFilter, useFilter } from "./use-filter"

/**
 * A checklist: every row has a box, `[✔]` ticked or `[ ]` not, so it reads as "pick any" at a glance. Up/down to move,
 * space to tick or untick, return to submit the ticked values (in option order), escape to dismiss. Drawn like
 * {@link SelectMenu} rather than through @inkjs/ui's `MultiSelect`, which marks only the ticked rows and so looks like a
 * single-choice list until something is ticked. With `filterable`, typing narrows the rows and ticks survive it.
 */
export function CheckMenu({
  options,
  defaultValue,
  width = 70,
  visibleCount,
  filterable = false,
  onSubmit,
  onClose
}: Readonly<{
  options: { label: string; value: string }[]
  /** The values ticked on open, e.g. the providers a re-run finds in use. */
  defaultValue?: string[]
  width?: number
  /** Rows shown at once, the list scrolling past that; defaults to all of them. */
  visibleCount?: number
  /** Typing filters the rows, for a list too long to scroll through. */
  filterable?: boolean
  onSubmit: (values: string[]) => void
  onClose?: () => void
}>) {
  const filter = useFilter(filterable)
  // The rows on show; `focused` and `from` are positions in this list
  const shown = options.filter(option => matchesFilter(option.label, filter.query))
  const visible = visibleCount === undefined ? options.length : Math.max(visibleCount, 1)
  const [focused, setFocused] = useState(0)
  const [from, setFrom] = useState(0)
  const [ticked, setTicked] = useState(() => new Set(defaultValue))

  function move(delta: number) {
    const next = focused + delta
    if (next < 0 || next >= shown.length) return
    setFocused(next)
    if (next < from) setFrom(next)
    else if (next >= from + visible) setFrom(next - visible + 1)
  }

  useKey((input, key) => {
    // Space ticks, so it never reaches the filter
    if (input === " ") {
      const value = shown[focused]?.value
      if (value === undefined) return
      setTicked(current => {
        const next = new Set(current)
        if (!next.delete(value)) next.add(value)
        return next
      })
    } else if (filter.handle(input, key)) {
      setFocused(0)
      setFrom(0)
    } else if (key.escape) onClose?.()
    else if (key.downArrow) move(1)
    else if (key.upArrow) move(-1)
    else if (key.return) onSubmit(options.filter(option => ticked.has(option.value)).map(option => option.value))
  })

  const { success } = useKajaTheme()
  const scrolls = shown.length > visible
  const hiddenBelow = Math.max(0, shown.length - from - visible)

  return (
    // Like SelectMenu: no background and no colour change, the highlighted row is marked by "❯" and bold alone.
    <InputFrame width={width} plain>
      {filterable && <FilterLine query={filter.query} />}
      {shown.length === 0 && <Text dimColor>{t("menu.noMatches")}</Text>}
      {shown.slice(from, from + visible).map((option, offset) => {
        const isFocused = from + offset === focused
        const isTicked = ticked.has(option.value)
        let arrow = " "
        if (offset === 0 && from > 0) arrow = "↑"
        else if (offset === visible - 1 && hiddenBelow > 0) arrow = "↓"
        return (
          <Box key={option.value} paddingLeft={isFocused ? 0 : 2} gap={1}>
            {isFocused && <Text bold>❯</Text>}
            {scrolls && <Text dimColor>{arrow}</Text>}
            {/* Only the tick is coloured: it says what's picked, the "❯" and bold say where you are. An empty box is dimmed so the ticks stand out. */}
            <Text bold={isFocused} {...(isTicked ? success() : { dimColor: !isFocused })}>
              {isTicked ? "[✔]" : "[ ]"}
            </Text>
            <Text bold={isFocused}>{option.label}</Text>
          </Box>
        )
      })}
    </InputFrame>
  )
}
