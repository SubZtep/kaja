import { Box, type BoxProps, Text } from "ink"
import type { ReactNode } from "react"
import { useKajaTheme } from "../theme"

// The line down the left edge that ties a trail of answers, the open question and its input together
const RAIL: BoxProps = {
  borderStyle: "single",
  borderTop: false,
  borderRight: false,
  borderBottom: false,
  borderDimColor: true
}

/** A marker in the rail's column, then its text indented past it, so a wrapped line stays clear of the rail. */
export function RailLine({ marker, children }: Readonly<{ marker: ReactNode; children: ReactNode }>) {
  return (
    <Box>
      <Box width={3} flexShrink={0}>
        {marker}
      </Box>
      {children}
    </Box>
  )
}

/** The open question: a "◆" and its title, then its input on the rail, closed off below. */
export function Question({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  // The question in its own colour, so it never reads like one of its answers. The terminal's own magenta, the same on
  // every question, the ones asked before a theme is chosen included: its palette keeps it readable on its background.
  const tone = { color: "magenta" }
  return (
    <Box flexDirection="column">
      <Text dimColor>│</Text>
      <RailLine marker={<Text {...tone}>◆</Text>}>
        <Text bold {...tone}>
          {title}
        </Text>
      </RailLine>
      <Box {...RAIL} flexDirection="column" gap={1} paddingLeft={2}>
        {children}
      </Box>
      <Text dimColor>└</Text>
    </Box>
  )
}

/** An answered question, left in the trail: a "✓", then the label dimmed and the answer. */
export function Answered({ label, value }: Readonly<{ label: string; value: string }>) {
  const { success } = useKajaTheme()
  return (
    <RailLine marker={<Text {...success()}>✓</Text>}>
      <Text>
        <Text dimColor>{label}</Text> {value}
      </Text>
    </RailLine>
  )
}

/**
 * The panel an answer sits in: `width` columns wide inside and growing with longer content. A typed answer's panel
 * has the input box's background, so the field stands out from the question; `plain` drops it, for the menus (their
 * highlight band is colour enough).
 */
export function InputFrame({
  children,
  width = 70,
  plain
}: Readonly<{ children: ReactNode; width?: number; plain?: boolean }>) {
  const { field } = useKajaTheme()
  return (
    <Box
      {...(plain ? {} : field())}
      flexDirection="column"
      // Neither the panel nor its rows stretch across the terminal: the panel is `width` (or its content) wide, and
      // each row keeps its own width, a menu's highlight band at least the panel's
      alignSelf="flex-start"
      alignItems="flex-start"
      minWidth={width + 2}
      paddingX={1}
    >
      {children}
    </Box>
  )
}
