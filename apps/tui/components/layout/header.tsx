import { Badge, Spinner } from "@inkjs/ui"
import { titleCase } from "@kaja/shared/text"
import { Box, type DOMElement, Text, useBoxMetrics } from "ink"
import { useRef } from "react"
import { useRandomSpinner } from "../../hooks/use-random-spinner"
import { describeToolCall } from "../../lib/agent/tool-labels"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { MonsterMate } from "./monster"

/**
 * Live top bar: the current persona on the left; on the right, in-flight tool activity or the active model name, the
 * prompt tokens when known, then a red YOLO badge while every approval is skipped and a badge for where the agent runs
 * (local or cloud, plus the `KAJA_PROFILE`). The right side's parts share the first row while they fit and wrap
 * onto the rows below otherwise, each flush right, so the model always keeps the top-right corner.
 *
 * `width` must be the full terminal width, so the right side has a real track to lay out against. Every part truncates
 * to one line, so the header is never taller than three rows, one per part (an unbounded one overflows the
 * full-screen frame and garbles the redraw).
 */
const compact = new Intl.NumberFormat(undefined, { notation: "compact" })

/** "12,345 tokens", or "12,345 / 33K tokens (38%)" once the window is known. */
export function tokensLabel(promptTokens: number | null, contextWindow?: number | null): string {
  if (promptTokens == null) return ""
  if (!contextWindow) return `${promptTokens.toLocaleString()} tokens`
  const percent = Math.round((promptTokens / contextWindow) * 100)
  return `${promptTokens.toLocaleString()} / ${compact.format(contextWindow)} tokens (${percent}%)`
}

export function Header({
  mode,
  persona,
  model,
  provider,
  promptTokens,
  contextWindow,
  currentTool,
  width,
  profile,
  yolo
}: Readonly<{
  /** Where the agent runs. */
  mode: "local" | "cloud"
  /** `KAJA_PROFILE`, after the mode, e.g. "LOCAL·dev". */
  profile?: string
  /** settings.toml's `yolo` is on: nothing asks for approval. */
  yolo?: boolean
  persona: string
  model: string
  /** Provider name shown after the model, e.g. "fireworks" → "Fireworks". */
  provider?: string
  promptTokens: number | null
  /** The model's context window, when known, so the count reads as how full it is. */
  contextWindow?: number | null
  currentTool?: { name: string; arguments: string }
  /** Terminal columns (from useWindowSize). */
  width: number
}>) {
  const tokens = tokensLabel(promptTokens, contextWindow)
  // The tokens below the model's row (wrapped) lose the "·" that joins them to it; a space keeps their width, so they can't fit back up and flicker
  const tokensRef = useRef<DOMElement>(null)
  const tokensBox = useBoxMetrics(tokensRef)
  const tokensWrapped = tokensBox.hasMeasured && tokensBox.top > 0
  const spinnerType = useRandomSpinner(!!currentTool, "block")
  const { muted, accent, toolLabel, badge } = useKajaTheme()
  const danger = badge("danger")
  const modeBadge = badge(mode === "cloud" ? "info" : "success")

  const badges = (
    <Box flexShrink={0} columnGap={1}>
      {yolo ? (
        <Badge color={danger.background}>
          <Text color={danger.text}>YOLO</Text>
        </Badge>
      ) : null}
      <Badge color={modeBadge.background}>
        <Text color={modeBadge.text}>{t(`header.${mode}`).toUpperCase()}</Text>
        {profile ? <Text dimColor> ·{profile}</Text> : null}
      </Badge>
    </Box>
  )

  return (
    <Box width={width} flexShrink={0} paddingX={1} columnGap={1}>
      <Box gap={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Box flexShrink={0}>
          <MonsterMate />
        </Box>
        <Box overflow="hidden" flexShrink={1} minWidth={0}>
          <Text {...accent()} wrap="truncate-end">
            {persona}
          </Text>
        </Box>
      </Box>
      {/* Packed to the right and wrapping: the parts that don't fit move to the rows below, still flush right */}
      <Box
        flexGrow={1}
        flexShrink={1}
        flexBasis={0}
        minWidth={0}
        flexWrap="wrap"
        justifyContent="flex-end"
        columnGap={1}
      >
        {currentTool ? (
          <Box flexShrink={1} gap={1} overflow="hidden" minWidth={0}>
            <Spinner type={spinnerType} />
            <Text {...toolLabel()} wrap="truncate-end">
              {describeToolCall(currentTool.name, currentTool.arguments)}
            </Text>
          </Box>
        ) : (
          // One text, so a narrow corner cuts the end of the name rather than each part
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text wrap="truncate-end">
              <Text {...muted()}>{titleCase(model)}</Text>
              {provider ? <Text dimColor>{` ${titleCase(provider)}`}</Text> : null}
            </Text>
          </Box>
        )}
        {tokens && !currentTool ? (
          <Box ref={tokensRef} flexShrink={1} minWidth={0} overflow="hidden">
            <Text {...muted()} wrap="truncate-end">
              {`${tokensWrapped ? " " : "·"} ${tokens}`}
            </Text>
          </Box>
        ) : null}
        {badges}
      </Box>
    </Box>
  )
}
