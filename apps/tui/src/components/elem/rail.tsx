import { Box, type BoxProps, Text } from "ink"
import { createContext, Fragment, type ReactElement, type ReactNode, useContext, useEffect, useState } from "react"
import { useKajaTheme } from "../theme"

/**
 * The grid every setup screen shares (the wizard, doctor's prompts, the output after them): a gutter mark in column 2,
 * labels from column 4, values from column 18, and nothing past column 78, since writing into the last column makes
 * some terminals wrap.
 */
const FRAME_WIDTH = 78
/** Columns 4 to 17: a label, padded so its value starts at column 18. */
export const LABEL_WIDTH = 14
/** Where a row's text starts: past the gutter mark and its space. */
const TEXT_COLUMN = 3

/** The width left for a row's text at this terminal width, never past column 78. */
export function textWidth(columns = process.stdout.columns || 80): number {
  return Math.min(FRAME_WIDTH, columns - 2) - TEXT_COLUMN
}

/** Pads `label` to the value column, always leaving at least one space. */
export function padLabel(label: string): string {
  return label + " ".repeat(Math.max(1, LABEL_WIDTH - Bun.stringWidth(label)))
}

// Inside a question: menus draw their rows in the rail style (a highlight band to column 78) instead of their own
const InRail = createContext(false)

/** Whether a menu sits inside a {@link Question}, and so draws its rows on the rail's grid. */
export function useInRail(): boolean {
  return useContext(InRail)
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

/** The setup grid's "busy" mark, dim: a check or download that's still running. */
export function Spinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setFrame(current => (current + 1) % SPINNER.length), 100)
    return () => clearInterval(timer)
  }, [])
  return <Text dimColor>{SPINNER[frame]}</Text>
}

/** A mark in the gutter (column 2), then its text from column 4, so a wrapped line stays clear of the gutter. */
export function RailLine({ marker, children }: Readonly<{ marker: ReactNode; children: ReactNode }>) {
  return (
    <Box paddingLeft={1}>
      <Box width={2} flexShrink={0}>
        {marker}
      </Box>
      {children}
    </Box>
  )
}

// The rail down the open question: a dim line in the gutter, its rows from column 4
const RAIL: BoxProps = {
  borderStyle: "single",
  borderTop: false,
  borderRight: false,
  borderBottom: false,
  borderDimColor: true,
  marginLeft: 1,
  paddingLeft: 1
}

/**
 * The open question, one bracket from "◆" to "└": the question in bold, its rows on the rail, then the hint on the
 * closing line. Nothing else goes on the question's line, keys included: they belong in the hint.
 */
export function Question({
  title,
  hint,
  children
}: Readonly<{ title: string; hint?: ReactNode; children: ReactNode }>) {
  const { accent } = useKajaTheme()
  return (
    <Box flexDirection="column">
      <RailLine marker={<Text {...accent()}>◆</Text>}>
        <Box width={textWidth()}>
          <Text bold>{title}</Text>
        </Box>
      </RailLine>
      {/* The padding keeps the rail running through the blank line above the hint */}
      <Box {...RAIL} flexDirection="column" gap={1} paddingBottom={1}>
        <InRail value>{children}</InRail>
      </Box>
      <RailLine marker={<Text dimColor>└</Text>}>
        <Box width={textWidth()}>
          {typeof hint === "string" ? (
            <Text dimColor wrap="truncate-end">
              {hint}
            </Text>
          ) : (
            (hint ?? null)
          )}
        </Box>
      </RailLine>
    </Box>
  )
}

/** A hint line: each key plain and what it does dim, joined by a dim "·", then an optional note, dim. */
export function KeyHint({ keys = [], note }: Readonly<{ keys?: [key: string, action: string][]; note?: string }>) {
  const parts: ReactElement[] = keys.map(([key, action]) => (
    <Text key={key}>
      {key} <Text dimColor>{action}</Text>
    </Text>
  ))
  if (note)
    parts.push(
      <Text key="note" dimColor>
        {note}
      </Text>
    )
  return (
    <Text wrap="truncate-end">
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 && <Text dimColor>{" · "}</Text>}
          {part}
        </Fragment>
      ))}
    </Text>
  )
}

/** An answered question left on screen: "✓", the label dim to the value column, then the answer. */
export function Answered({ label, value }: Readonly<{ label: string; value: string }>) {
  const { success } = useKajaTheme()
  return (
    <RailLine marker={<Text {...success()}>✓</Text>}>
      <Text>
        <Text dimColor>{padLabel(label)}</Text>
        {value}
      </Text>
    </RailLine>
  )
}

/** One of the open block's recent answers: on the rail, the label dim to the value column, then the answer. */
export function RecentAnswer({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <RailLine marker={<Text dimColor>│</Text>}>
      <Text wrap="truncate-end">
        <Text dimColor>{padLabel(label)}</Text>
        {value}
      </Text>
    </RailLine>
  )
}

/**
 * A menu row on the rail: the cursor, then the row. The focused one is a band to column 78 with "❯" in the accent and
 * the row in bold; the others leave the cursor's place blank.
 */
export function MenuRow({
  focused,
  dim,
  band,
  children
}: Readonly<{
  focused: boolean
  dim?: boolean
  /** The focused row's band in place of the highlight, e.g. the theme step's preview colours. */
  band?: BoxProps
  children: ReactNode
}>) {
  const { accent, highlightRow } = useKajaTheme()
  return (
    <Box width={textWidth()} gap={1} {...(focused ? (band ?? highlightRow()) : {})}>
      <Text dimColor={dim} {...(focused && !dim ? accent() : {})}>
        {focused ? "❯" : " "}
      </Text>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  )
}

/**
 * The panel a typed answer sits in: `width` columns wide inside and growing with longer content, in the input box's
 * background so the field stands out from the question; `plain` drops it, for the menus.
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
