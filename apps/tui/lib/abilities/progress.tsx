import { ProgressBar } from "@inkjs/ui"
import { Box, render, Text } from "ink"
import { ConsoleTheme } from "../../components/theme"

const BAR_WIDTH = 30

function StepProgress({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <Box gap={1}>
      <Text>{label}</Text>
      <Box width={BAR_WIDTH}>
        <ProgressBar value={value} />
      </Box>
    </Box>
  )
}

/**
 * Runs `task` under ink-ui's ProgressBar, advanced by one of `steps` each time the task calls its `onStep`. The bar stays
 * where it stopped (full, or at the step that failed) above what the caller prints next. Without a terminal it just runs the task.
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
