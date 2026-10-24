import { render, Text } from "ink"
import { padLabel, RailLine } from "../../components/elem/rail"
import { ConsoleTheme, useKajaTheme } from "../../components/theme"

const BAR_WIDTH = 36

/** A step bar on the setup grid: "⠋" while running (✓ when full), the label to the value column, ━ done and ─ to go. */
function StepProgress({ label, value }: Readonly<{ label: string; value: number }>) {
  const { accent, success } = useKajaTheme()
  const done = value >= 100
  const filled = Math.max(0, Math.round((Math.min(value, 100) / 100) * BAR_WIDTH))
  return (
    <RailLine marker={done ? <Text {...success()}>✓</Text> : <Text dimColor>⠋</Text>}>
      <Text>
        {padLabel(label)}
        <Text {...(done ? success() : accent())}>{"━".repeat(filled)}</Text>
        <Text dimColor>{"─".repeat(Math.max(0, BAR_WIDTH - filled))}</Text>
        {done ? null : <Text dimColor> {Math.round(value)}%</Text>}
      </Text>
    </RailLine>
  )
}

/**
 * Runs `task` under ink-ui's ProgressBar, advanced by one of `steps` each time the task calls its `onStep`. The bar
 * stays where it stopped (full, or at the step that failed) above what the caller prints next. Without a terminal it
 * just runs the task.
 */
export async function withStepProgress<T>(
  label: string,
  steps: number,
  task: (onStep: () => void) => Promise<T>
): Promise<T> {
  if (!process.stdout.isTTY) return task(() => {})

  let done = 0
  const view = () => (
    <ConsoleTheme>
      <StepProgress label={label} value={(done / steps) * 100} />
    </ConsoleTheme>
  )
  const instance = render(view())
  try {
    return await task(() => {
      done++
      instance.rerender(view())
    })
  } finally {
    instance.unmount()
  }
}
