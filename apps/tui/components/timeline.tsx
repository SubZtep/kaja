import { Box, Text } from "ink"
import { memo } from "react"
import type { TimelineEvent } from "../hooks/use-agent"
import type { ErrorCategory } from "../lib/agent/error-category"
import { t } from "../lib/i18n"
import Markdown from "./elem/markdown"
import { ReasoningBox } from "./elem/reasoning-box"
import { TerminalImage } from "./elem/terminal-image"
import { useKajaTheme } from "./theme"

const ERROR_ICON: Record<ErrorCategory, string> = {
  network: "⚠",
  tool: "✗",
  agent: "✗",
  unknown: "✗"
}

/**
 * One finalized timeline entry (user message, tool call, final reply, …).
 * Memoized: events are immutable once appended, so scroll ticks and
 * streaming flushes (which re-render the whole ScrollView subtree) bail
 * out here instead of re-rendering every history item.
 */
export const TimelineItem = memo(function TimelineItem({ item, thinking }: { item: TimelineEvent; thinking: boolean }) {
  const theme = useKajaTheme()
  const content = renderItem(item, thinking, theme)
  if (content === null) return null
  return (
    <Box flexDirection="column">
      <Text> </Text>
      {content}
    </Box>
  )
})

function renderItem(item: TimelineEvent, thinking: boolean, theme: ReturnType<typeof useKajaTheme>) {
  switch (item.type) {
    case "user":
      return <Text {...theme.userText()}>{`> ${item.text}`}</Text>
    case "reasoning":
      if (!thinking) return null
      return <ReasoningBox>{item.text}</ReasoningBox>
    case "tool_image":
      return <Text dimColor>{`[image: ${item.path}]`}</Text>
    case "display_image":
      return <TerminalImage href={item.url} alt={item.alt} />
    case "message":
      return (
        <Box gap={2}>
          <Text {...theme.accent()}>●</Text>
          <Markdown>{item.content}</Markdown>
        </Box>
      )
    case "ask_user":
      return (
        <Box gap={2}>
          <Text {...theme.userText()}>●</Text>
          <Markdown>{item.question}</Markdown>
        </Box>
      )
    case "confirm_command":
      return <Text {...theme.warning()}>{`$ ${item.command}`}</Text>
    case "confirm_tool":
      return <Text {...theme.warning()}>{`→ ${item.summary}`}</Text>
    case "persona_switch":
      return <Text dimColor>{t("timeline.personaSwitch", { label: item.label })}</Text>
    case "error": {
      const errorLabel = t(`error.${item.category}`)
      return <Text {...theme.danger()}>{`${ERROR_ICON[item.category]} ${errorLabel}: ${item.text}`}</Text>
    }
    case "final":
      return <Markdown>{item.content ?? "N/A"}</Markdown>
  }
}
