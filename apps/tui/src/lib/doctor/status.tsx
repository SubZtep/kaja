import { Box, renderToString, Text } from "ink"
import { padLabel, RailLine } from "../../components/elem/rail"
import { ConsoleTheme, useKajaTheme } from "../../components/theme"

// Piped output isn't wrapped, so a long error stays on one greppable line
const UNWRAPPED_COLUMNS = 1000

/** How a report line went: each has its own mark, so it reads without colour. */
export type StatusVariant = "success" | "warning" | "error" | "info"

const MARK: Record<StatusVariant, string> = { success: "✓", warning: "!", error: "✗", info: "ℹ" }

/** A {@link statusLine} as a component, for a live row that ends as a report line. */
export function StatusRow({
  variant,
  text,
  subject
}: Readonly<{ variant: StatusVariant; text: string; subject?: string }>) {
  const theme = useKajaTheme()
  const style = { success: theme.success(), warning: theme.warning(), error: theme.danger(), info: { dimColor: true } }[
    variant
  ]
  // A problem's detail is plain and a fine one's dim, so problems are what you read first
  const problem = variant === "error" || variant === "warning"
  return (
    <RailLine marker={<Text {...style}>{MARK[variant]}</Text>}>
      <Box flexShrink={1}>
        <Text>
          {subject ? padLabel(subject) : ""}
          <Text dimColor={Boolean(subject) && !problem}>{text}</Text>
        </Text>
      </Box>
    </RailLine>
  )
}

/**
 * One report line on the setup grid, for printing with console.log: its mark in column 2, then `subject` padded to the
 * value column (when given) and the text. Wrapped lines hang at column 4.
 */
export function statusLine(variant: StatusVariant, text: string, { subject }: { subject?: string } = {}): string {
  // Never past column 80 in a terminal, like the setup frame
  const columns = process.stdout.isTTY ? Math.min(process.stdout.columns || 80, 80) : UNWRAPPED_COLUMNS
  return renderToString(
    <ConsoleTheme>
      <StatusRow variant={variant} text={text} subject={subject} />
    </ConsoleTheme>,
    { columns }
  )
}

/** A section's opening line, e.g. "Finishing up ────": the title bold, then a dim rule to column 78. */
export function sectionRule(title: string): string {
  const rule = "─".repeat(Math.max(3, 78 - 2 - Bun.stringWidth(title)))
  return renderToString(
    <ConsoleTheme>
      <Box paddingLeft={1}>
        <Text>
          <Text bold>{title}</Text> <Text dimColor>{rule}</Text>
        </Text>
      </Box>
    </ConsoleTheme>,
    { columns: 80 }
  )
}
