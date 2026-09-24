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

/** The open question: a "◆" and its title, then its input on the rail, closed off below. `plain` drops the colour, for a question asked before a theme is chosen. */
export function Question({
  title,
  plain,
  children
}: Readonly<{ title: string; plain?: boolean; children: ReactNode }>) {
  const { accent } = useKajaTheme()
  return (
    <Box flexDirection="column">
      <Text dimColor>│</Text>
      <RailLine marker={<Text {...(plain ? { bold: true } : accent())}>◆</Text>}>
        <Text bold>{title}</Text>
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

/** The bordered box a typed answer sits in. */
export function InputFrame({ children }: Readonly<{ children: ReactNode }>) {
  const { frame } = useKajaTheme()
  return (
    <Box {...frame()} borderStyle="classic" width={70} paddingLeft={1}>
      {children}
    </Box>
  )
}
