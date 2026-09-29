import { isAbsolute } from "node:path"
import { StatusMessage, type StatusMessageProps } from "@inkjs/ui"
import { Box, Text } from "ink"
import { memo } from "react"
import type { ErrorCategory } from "../lib/agent/error-category"
import { describeToolCall } from "../lib/agent/tool-labels"
import { t } from "../lib/i18n"
import type { DisplayEvent } from "../lib/tool-summary"
import Markdown from "./elem/markdown"
import { ReasoningBox } from "./elem/reasoning-box"
import { TerminalImage } from "./elem/terminal-image"
import { useKajaTheme } from "./theme"

// A network hiccup is worth retrying, so it's a warning; anything else failed
const ERROR_VARIANT: Record<ErrorCategory, StatusMessageProps["variant"]> = {
  network: "warning",
  tool: "error",
  agent: "error",
  unknown: "error"
}

/**
 * One finalized timeline entry (user message, tool call, final reply, …).
 * Memoized: events are immutable once appended, so scroll ticks and
 * streaming flushes (which re-render the whole ScrollView subtree) bail
 * out here instead of re-rendering every history item.
 */
export const TimelineItem = memo(function TimelineItem({ item, thinking }: { item: DisplayEvent; thinking: boolean }) {
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

// Only the left edge is drawn, as a thin bar
const USER_BAR = {
  topLeft: "",
  top: "",
  topRight: "",
  left: "▎",
  bottomLeft: "",
  bottom: "",
  bottomRight: "",
  right: ""
}

const SUMMARY_NAMES = 3

// The first few distinct tool names, then an ellipsis
function summaryNames(names: string[]) {
  return names.length > SUMMARY_NAMES ? `${names.slice(0, SUMMARY_NAMES).join(", ")}, …` : names.join(", ")
}

function renderItem(item: DisplayEvent, thinking: boolean, theme: ReturnType<typeof useKajaTheme>) {
  switch (item.type) {
    case "user":
      return (
        <Box
          {...theme.userBox()}
          borderStyle={USER_BAR}
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          paddingX={1}
          width="100%"
        >
          <Text {...theme.userText()}>{item.text}</Text>
        </Box>
      )
    case "tool_call":
    case "client_tool_call":
      return <Text dimColor>{`⚙ ${describeToolCall(item.name, item.arguments)}`}</Text>
    case "tool_summary":
      return (
        <Text dimColor>{`⚙ ${t("timeline.toolsUsed", { count: item.count, names: summaryNames(item.names) })}`}</Text>
      )
    case "reasoning":
      if (!thinking) return null
      return <ReasoningBox>{item.text}</ReasoningBox>
    case "tool_image":
      // A cloud image arrives as a signed URL, too long to show as its caption; a local one is a file path.
      return <TerminalImage href={item.path} alt={isAbsolute(item.path) ? `[image: ${item.path}]` : "[image]"} />
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
    case "compacted":
      return (
        <Text dimColor>
          {t(item.dropped ? "timeline.compactedDropped" : "timeline.compacted", {
            before: item.beforeTokens.toLocaleString(),
            after: item.afterTokens.toLocaleString()
          })}
        </Text>
      )
    case "condensed":
      return (
        <Text dimColor>
          {t("timeline.condensed", {
            tool: item.tool,
            before: item.beforeTokens.toLocaleString(),
            after: item.afterTokens.toLocaleString()
          })}
        </Text>
      )
    case "notice":
      return <Text dimColor>{item.text}</Text>
    case "error": {
      const errorLabel = t(`error.${item.category}`)
      return <StatusMessage variant={ERROR_VARIANT[item.category]}>{`${errorLabel}: ${item.text}`}</StatusMessage>
    }
    case "final":
      return <Markdown>{item.content ?? "N/A"}</Markdown>
  }
}
