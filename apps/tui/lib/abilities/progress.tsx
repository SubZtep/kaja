import { render, renderToString, Text } from "ink"
import type { ReactNode } from "react"
import { padLabel, RailLine, Spinner } from "../../components/elem/rail"
import { ConsoleTheme, useKajaTheme } from "../../components/theme"

const BAR_WIDTH = 36

/**
 * A progress row on the setup grid: a spinner while running (✓ when done), the label to the value column, ━ done and ─
 * to go, then the percent while running and `note` once done (e.g. a download's size), both dim.
 */
function ProgressRow({ label, value, note }: Readonly<{ label: string; value: number; note?: string }>) {
  const { accent, success } = useKajaTheme()
  const done = value >= 100
  const filled = Math.max(0, Math.round((Math.min(value, 100) / 100) * BAR_WIDTH))
  return (
    <RailLine marker={done ? <Text {...success()}>✓</Text> : <Spinner />}>
      <Text>
        {padLabel(label)}
        <Text {...(done ? success() : accent())}>{"━".repeat(filled)}</Text>
        <Text dimColor>{"─".repeat(Math.max(0, BAR_WIDTH - filled))}</Text>
        {done ? note && <Text dimColor> {note}</Text> : <Text dimColor> {Math.round(value)}%</Text>}
      </Text>
    </RailLine>
  )
}

/** A live progress row, redrawn in place; `finish` leaves the full bar (or `instead`, e.g. a failure line) behind. */
export type LiveProgress = {
  update: (percent: number) => void
  finish: (outcome: { note?: string } | { instead: ReactNode }) => void
}

/**
 * Starts a {@link ProgressRow} for `label`. Without a terminal nothing redraws: only the finished row prints, since a
 * redirected log would otherwise collect one line per update.
 */
export function liveProgress(label: string): LiveProgress {
  const view = (node: ReactNode) => <ConsoleTheme>{node}</ConsoleTheme>
  const last = (outcome: { note?: string } | { instead: ReactNode }) =>
    "instead" in outcome ? outcome.instead : <ProgressRow label={label} value={100} note={outcome.note} />

  if (!process.stdout.isTTY)
    return {
      update: () => {},
      finish: outcome => console.log(renderToString(view(last(outcome)), { columns: 1000 }))
    }

  let percent = 0
  const instance = render(view(<ProgressRow label={label} value={0} />))
  return {
    update(next) {
      // Ink redraws on every rerender, and a download reports far more often than the percent changes
      if (Math.round(next) === Math.round(percent)) return
      percent = Math.min(next, 99)
      instance.rerender(view(<ProgressRow label={label} value={percent} />))
    },
    finish(outcome) {
      instance.rerender(view(last(outcome)))
      instance.unmount()
    }
  }
}

/**
 * Runs `task`, its bar advanced by one of `steps` each time the task calls its `onStep`. The bar stays where it stopped
 * (full, or at the step that failed) above what the caller prints next. Without a terminal it just runs the task.
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
      <ProgressRow label={label} value={(done / steps) * 100} />
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
