import { defaultTheme, extendTheme, Spinner, ThemeProvider } from "@inkjs/ui"
import type { SpinnerName } from "cli-spinners"
import type { TextProps } from "ink"
import { useEffect, useState } from "react"
import type { PartialMessage } from "../hooks/use-agent"
import { t } from "../lib/i18n"

const TICK_MS = 120

const DOTS_SPINNERS: SpinnerName[] = [
  "dots",
  "dots2",
  "dots3",
  "dots4",
  "dots5",
  "dots6",
  "dots7",
  "dots8",
  "dots9",
  "dots10",
  "dots11",
  "dots12",
  "dots13",
  "dots14",
  "dots8Bit",
  "dotsCircle"
]

function randomDotsSpinner(): SpinnerName {
  return DOTS_SPINNERS[Math.floor(Math.random() * DOTS_SPINNERS.length)] as SpinnerName
}

const customTheme = extendTheme(defaultTheme, {
  components: {
    Spinner: {
      styles: {
        label: (): TextProps => ({
          color: "magenta",
          dimColor: true
        })
      }
    }
  }
})

/** Rough token estimate from streamed text (~4 characters per token). */
function estimateTokens(partial: PartialMessage | null) {
  if (!partial) return 0
  return Math.round((partial.reasoning.length + partial.content.length) / 4)
}

/**
 * Activity line shown while a run is in flight but nothing is visibly
 * streaming — i.e. before the first token, or while reasoning streams with
 * the thinking display off. A spinner plus elapsed time and a rough token
 * count, so the terminal never looks stuck.
 */
export function Activity({
  pending,
  partial,
  thinking
}: Readonly<{
  pending: boolean
  partial: PartialMessage | null
  thinking: boolean
}>) {
  const [tick, setTick] = useState(0)
  const [spinnerType, setSpinnerType] = useState(randomDotsSpinner)
  useEffect(() => {
    if (!pending) return
    setTick(0)
    setSpinnerType(randomDotsSpinner())
    const timer = setInterval(() => setTick(t => t + 1), TICK_MS)
    return () => clearInterval(timer)
  }, [pending])

  const contentVisible = !!partial?.content
  const reasoningVisible = thinking && !!partial?.reasoning
  if (!pending || contentVisible || reasoningVisible) return null

  const seconds = Math.floor((tick * TICK_MS) / 1000)
  const tokens = estimateTokens(partial)

  return (
    <ThemeProvider theme={customTheme}>
      <Spinner
        type={spinnerType}
        label={`${t("activity.thinking", { seconds })}${tokens ? t("activity.tokens", { tokens }) : ""}`}
      />
    </ThemeProvider>
  )
}
