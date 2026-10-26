import { Box, Text } from "ink"
import { useState } from "react"
import { useKey } from "../../hooks/use-key"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { FilterLine, Matched, matchesFilter, useFilter } from "./menu-filter"
import { MenuRow } from "./rail"

/** One row of a {@link CheckMenu}. */
export type CheckOption = {
  label: string
  value: string
  /** Dim columns after the label, lined up across rows: what kind of thing it is, why it's ticked. */
  detail?: string[]
  /** A dim heading drawn above the first row of each run of rows sharing it, while nothing is typed. */
  group?: string
}

// Widest a label or a detail column grows before the rest of its rows are cut short
const MAX_LABEL = 26
const MAX_DETAIL = 22

type Row = { heading: string } | { option: number }

/**
 * A checklist on the rail: "●" ticked, "○" not, so it reads as "pick any" without colour. Up/down to move, space to
 * tick or untick, return to submit the ticked values (in option order), escape to dismiss. With `filterable`, typing
 * narrows the rows (ticks survive it), the matches underlined; the line above counts what's ticked and shown.
 */
export function CheckMenu({
  options,
  defaultValue,
  visibleCount,
  filterable = false,
  enterPicksFocused = false,
  onSubmit,
  onClose
}: Readonly<{
  options: CheckOption[]
  /** The values ticked on open, e.g. the providers a re-run finds in use. */
  defaultValue?: string[]
  /** Rows shown at once, the list scrolling past that; defaults to all of them. */
  visibleCount?: number
  /** Typing filters the rows, for a list too long to scroll through. */
  filterable?: boolean
  /** Return with nothing ticked submits the highlighted row, for a list where one answer is the usual case. */
  enterPicksFocused?: boolean
  onSubmit: (values: string[]) => void
  onClose?: () => void
}>) {
  const filter = useFilter(filterable)
  // The options on show, as indexes into `options`; `focused` is a position in this list
  const shown = options.flatMap((option, index) => (matchesFilter(option.label, filter.query) ? [index] : []))
  const [focused, setFocused] = useState(0)
  const [from, setFrom] = useState(0)
  const [ticked, setTicked] = useState(() => new Set(defaultValue))

  // Headings only while nothing is typed: a filtered list is short enough to read without them
  const rows: Row[] = []
  let previous: string | undefined
  for (const index of shown) {
    const group = options[index]!.group
    if (!filter.query && group && group !== previous) rows.push({ heading: group })
    previous = group
    rows.push({ option: index })
  }
  const visible = visibleCount === undefined ? rows.length : Math.max(visibleCount, 1)
  const rowOf = (position: number) => rows.findIndex(row => "option" in row && row.option === shown[position])

  function move(delta: number) {
    const next = focused + delta
    if (next < 0 || next >= shown.length) return
    setFocused(next)
    const row = rowOf(next)
    // Keep the heading above a group's first row in view with it
    const top = rows[row - 1] && "heading" in rows[row - 1]! ? row - 1 : row
    if (top < from) setFrom(top)
    else if (row >= from + visible) setFrom(row - visible + 1)
  }

  useKey((input, key) => {
    // Space ticks, so it never reaches the filter
    if (input === " ") {
      const value = options[shown[focused]!]?.value
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
    else if (key.return) {
      const values = options.filter(option => ticked.has(option.value)).map(option => option.value)
      const focusedValue = options[shown[focused]!]?.value
      onSubmit(values.length === 0 && enterPicksFocused && focusedValue !== undefined ? [focusedValue] : values)
    }
  })

  const { accent } = useKajaTheme()
  const windowed = rows.slice(from, from + visible).flatMap(row => ("option" in row ? [options[row.option]!] : []))
  // Columns as wide as the rows on show need, so a short list isn't spread across the screen
  const labelWidth = Math.min(MAX_LABEL, Math.max(0, ...windowed.map(option => Bun.stringWidth(option.label))))
  const detailWidths = windowed.reduce<number[]>((widths, option) => {
    for (const [column, text] of (option.detail ?? []).entries())
      widths[column] = Math.min(MAX_DETAIL, Math.max(widths[column] ?? 0, Bun.stringWidth(text)))
    return widths
  }, [])
  const optionsIn = (list: Row[]) => list.filter(row => "option" in row).length
  const hiddenAbove = optionsIn(rows.slice(0, from))
  const hiddenBelow = optionsIn(rows.slice(from + visible))
  const count = [
    ...(ticked.size > 0 ? [t("menu.countTicked", { count: ticked.size })] : []),
    filter.query ? t("menu.countMatch", { count: shown.length }) : t("menu.countTotal", { count: options.length })
  ].join(" · ")

  return (
    <Box flexDirection="column">
      {filterable && (
        <Box marginBottom={1}>
          <FilterLine query={filter.query} count={count} />
        </Box>
      )}
      {shown.length === 0 && <Text dimColor>{t("menu.noMatches")}</Text>}
      {hiddenAbove > 0 && <More count={hiddenAbove} />}
      {rows.slice(from, from + visible).map(row => {
        if ("heading" in row)
          return (
            <Text key={`heading:${row.heading}`} dimColor>
              {row.heading}
            </Text>
          )
        const option = options[row.option]!
        const isFocused = shown[focused] === row.option
        const isTicked = ticked.has(option.value)
        return (
          <MenuRow key={option.value} focused={isFocused}>
            <Box>
              <Box width={2} flexShrink={0}>
                <Text {...(isTicked ? accent() : { dimColor: true })}>{isTicked ? "●" : "○"}</Text>
              </Box>
              <Box width={labelWidth + 2} flexShrink={0}>
                <Text wrap="truncate-end">
                  <Matched text={option.label} query={filter.query} bold={isFocused} />
                </Text>
              </Box>
              {(option.detail ?? []).map((text, column) => (
                // The last column takes what's left of the row, so a long reason isn't cut short early
                <Box
                  key={column}
                  {...(column === (option.detail?.length ?? 0) - 1
                    ? { flexGrow: 1, flexShrink: 1 }
                    : { width: (detailWidths[column] ?? 0) + 2, flexShrink: 0 })}
                >
                  <Text dimColor wrap="truncate-end">
                    {text}
                  </Text>
                </Box>
              ))}
            </Box>
          </MenuRow>
        )
      })}
      {hiddenBelow > 0 && <More count={hiddenBelow} />}
    </Box>
  )
}

/** "⋮ N more", in the cursor's column: rows scrolled out of view. */
function More({ count }: Readonly<{ count: number }>) {
  return <Text dimColor>⋮ {t("menu.more", { count })}</Text>
}
