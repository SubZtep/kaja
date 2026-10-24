import { Spinner } from "@inkjs/ui"
import { titleCase } from "@kaja/shared/text"
import { Box, Text } from "ink"
import { useRandomSpinner } from "../../hooks/use-random-spinner"
import { describeToolCall } from "../../lib/agent/tool-labels"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { Monster, monsterWidth } from "./monster"

const compact = new Intl.NumberFormat(undefined, { notation: "compact" })

// The monster's width plus the gap after it
const MONSTER_COLS = monsterWidth() + 1
// Past this share of the window, the header gives the full count, not just the percent
const FULL_COUNT_FROM = 50
const TAG_GAP = 3

/**
 * How full the context is: "1%" while there's room, "18,000 / 33K (55%)" past half, "12,345 tokens" while the window is
 * unknown, nothing before the first reply.
 */
export function tokensLabel(promptTokens: number | null, contextWindow?: number | null): string {
  if (promptTokens == null) return ""
  if (!contextWindow) return t("header.tokens", { count: promptTokens.toLocaleString() })
  const percent = Math.round((promptTokens / contextWindow) * 100)
  if (percent < FULL_COUNT_FROM) return `${percent}%`
  return `${promptTokens.toLocaleString()} / ${compact.format(contextWindow)} (${percent}%)`
}

/**
 * The model's line, as much as fits in `room` columns: model · provider · usage, dropping the provider first and then
 * the model; usage alone is the last resort.
 */
export function infoParts(model: string, provider: string | undefined, usage: string, room: number): string {
  const tries = [[model, provider, usage], [model, usage], [usage]].map(parts => parts.filter(Boolean).join(" · "))
  return tries.find(line => Bun.stringWidth(line) <= room) ?? ""
}

/**
 * Live top bar on one row: the monster and the persona (accent, bold) on the left; on the right, dim, the model,
 * provider and how full the context is (or the tool running, when `currentTool` is set), then where the agent runs as a
 * dim tag, with YOLO in the warning colour while every approval is skipped. What doesn't fit drops (the provider, then
 * the model), and the persona's name truncates last.
 */
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
  /** `KAJA_PROFILE`, after the mode, e.g. "local · dev". */
  profile?: string
  /** Settings.toml's `yolo` is on: nothing asks for approval. */
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
  const spinnerType = useRandomSpinner(!!currentTool, "block")
  const { accent, warning } = useKajaTheme()

  const tag = [t(`header.${mode}`), profile].filter(Boolean).join(" · ")
  const yoloTag = yolo ? "YOLO" : ""
  const tags = [yoloTag, tag].filter(Boolean).join("  ")
  // What's left for the right side once the monster, a short persona and the tags have their place
  const personaCols = Math.min(Bun.stringWidth(persona), 16)
  const room = Math.max(0, width - 2 - MONSTER_COLS - personaCols - TAG_GAP - Bun.stringWidth(tags) - TAG_GAP)
  const info = currentTool
    ? ""
    : infoParts(
        titleCase(model) ?? model,
        (provider && titleCase(provider)) || undefined,
        tokensLabel(promptTokens, contextWindow),
        room
      )

  return (
    <Box width={width} flexShrink={0} paddingX={1} columnGap={TAG_GAP}>
      <Box gap={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Box flexShrink={0}>
          <Monster />
        </Box>
        <Box overflow="hidden" flexShrink={1} minWidth={0}>
          <Text {...accent()} bold wrap="truncate-end">
            {persona}
          </Text>
        </Box>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0} justifyContent="flex-end" overflow="hidden">
        {currentTool ? (
          <Box flexShrink={1} gap={1} overflow="hidden" minWidth={0}>
            <Spinner type={spinnerType} />
            <Text dimColor wrap="truncate-end">
              {describeToolCall(currentTool.name, currentTool.arguments)}
            </Text>
          </Box>
        ) : (
          <Text dimColor wrap="truncate-end">
            {info}
          </Text>
        )}
      </Box>
      <Box flexShrink={0}>
        <Text>
          {yoloTag ? (
            <Text {...warning()} bold>
              {yoloTag}
            </Text>
          ) : null}
          {yoloTag ? "  " : ""}
          <Text dimColor>{tag}</Text>
        </Text>
      </Box>
    </Box>
  )
}
