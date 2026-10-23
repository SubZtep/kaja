import { Box, Text, useInput, useStdout, useWindowSize } from "ink"
import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import type { PartialMessage as PartialMessageData, TimelineEvent } from "../../hooks/use-agent"
import { useMouseTracking } from "../../hooks/use-mouse-tracking"
import { useTerminalReports } from "../../hooks/use-terminal-reports"
import { copyableText, copyToClipboard } from "../../lib/copy"
import { t } from "../../lib/i18n"
import { isAtBottom, STICK_SLOP } from "../../lib/scroll-stick"
import { parseWheelDirection } from "../../lib/terminal-input"
import { type DisplayEvent, foldToolCalls } from "../../lib/tool-summary"
import { uiEvents } from "../../lib/ui-events"
import { Activity } from "../activity"
import { PartialMessage } from "../elem/partial-message"
import { VirtualScroll, type VirtualScrollRef } from "../elem/virtual-scroll"
import { itemShows, TimelineItem } from "../timeline"

const WHEEL_LINES = 3

// Stable per-event identity for list keys: events are only ever appended or the whole array is reset (see useAgent), never reordered or spliced, so a monotonic id assigned the first time an event object is seen is stable across re-renders without needing an id field on TimelineEvent itself.
const eventIds = new WeakMap<TimelineEvent, number>()
let nextEventId = 0
function idFor(event: TimelineEvent) {
  let id = eventIds.get(event)
  if (id === undefined) {
    id = nextEventId++
    eventIds.set(event, id)
  }
  return id
}

function visibleEvents(events: TimelineEvent[], toolDisplay: "minimal" | "verbose" | "corner", pending: boolean) {
  if (toolDisplay === "verbose") return events
  if (toolDisplay === "corner") return events.filter(item => item.type !== "tool_call")
  return foldToolCalls(events, pending)
}

// The agent's own words, each set apart; tool lines and notices stay under whatever they follow.
const SAID: ReadonlySet<DisplayEvent["type"]> = new Set(["message", "final", "ask_user"])
const TOOL_LINES: ReadonlySet<DisplayEvent["type"]> = new Set(["tool_call", "tool_summary"])

/**
 * Which items get a blank line above: a user message, the agent's first item after it (unless a tool line), and each of
 * the agent's words (except straight under the reasoning that led to them), so tool calls and notices stack without
 * gaps. Reasoning hidden by `thinking` doesn't count.
 */
function spacing(items: DisplayEvent[], thinking: boolean) {
  let previous: DisplayEvent["type"] | undefined
  return items.map(item => {
    const spaced =
      item.type === "user"
        ? previous !== undefined
        : (previous === "user" && !TOOL_LINES.has(item.type)) ||
          (SAID.has(item.type) && previous !== undefined && previous !== "reasoning")
    if (itemShows(item, thinking)) previous = item.type
    return spaced
  })
}

/** Most recent message with copyable text, searching from the end of the timeline. */
function lastCopyableText(events: TimelineEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const text = copyableText(events[i]!)
    if (text) return text
  }
  return null
}

/**
 * Clamp to the real bottom offset (VirtualScroll clamps internally too; kept here so the input handlers stay
 * self-evidently safe).
 */
function clampScrollTo(view: VirtualScrollRef, offset: number) {
  const bottom = view.getBottomOffset()
  const next = Math.max(0, Math.min(offset, bottom))
  view.scrollTo(next)
  return next
}

function scrollByClamped(view: VirtualScrollRef, delta: number) {
  return clampScrollTo(view, view.getScrollOffset() + delta)
}

/**
 * Scrollable middle pane: finalized history + streaming partial + activity.
 *
 * Content is bottom-anchored (chat grows upward from the input). A dynamic top spacer fills unused viewport rows when
 * history is short, so you never see a floating block at the top of an empty pane.
 *
 * Key ownership (chat vs text field): PageUp/Down, Ctrl+↑/↓, Ctrl+Home/End, mouse wheel → this viewport ↑/↓, ←/→,
 * Home/End (no ctrl), Ctrl+←/→ → TextInput cursor Ctrl+T → mic the copy button / <modifier>+R (app.tsx) → uiEvents
 * "copy" → this viewport copies the latest message
 *
 * Stick-to-bottom uses a small slop so streaming near the end stays pinned.
 */
export function ChatViewport({
  events,
  thinking,
  partial,
  pending,
  bottomChromeKey,
  startupPanel,
  toolDisplay = "minimal",
  currentTool
}: Readonly<{
  events: TimelineEvent[]
  thinking: boolean
  partial: PartialMessageData | null
  pending: boolean
  /**
   * Changes whenever the sibling below (input / confirm prompt) swaps to a differently-sized layout, so the viewport
   * remeasures even though none of the other props changed.
   */
  bottomChromeKey?: string | number
  /** Shown in place of the empty timeline before the first message. */
  startupPanel?: ReactNode
  /** How tool calls show in the chat; corner keeps them out of it (the header shows the current one). */
  toolDisplay?: "minimal" | "verbose" | "corner"
  /** The tool call in flight, for minimal's live row. */
  currentTool?: { name: string; arguments: string }
}>) {
  const scrollRef = useRef<VirtualScrollRef>(null)
  const stickRef = useRef(true)
  const topPadRef = useRef(0)
  const [stuckToBottom, setStuckToBottom] = useState(true)
  const [canScroll, setCanScroll] = useState(false)
  /** Extra rows above the messages so short history sits on the bottom edge. */
  const [topPad, setTopPad] = useState(0)
  const { columns, rows } = useWindowSize()
  const { stdout } = useStdout()

  useMouseTracking(true)

  const setStick = (next: boolean) => {
    stickRef.current = next
    setStuckToBottom(next)
  }

  const syncCanScroll = () => {
    const view = scrollRef.current
    if (!view) return
    setCanScroll(view.getBottomOffset() > 0)
  }

  /**
   * Keep messages bottom-aligned when they don't fill the viewport: topPad = max(0, viewport - messageHeight), with
   * messageHeight excluding the spacer itself.
   */
  const syncTopPad = () => {
    const view = scrollRef.current
    if (!view) return
    const vh = view.getViewportHeight()
    if (vh <= 0) return
    const total = view.getContentHeight()
    const messagesH = Math.max(0, total - topPadRef.current)
    const next = Math.max(0, vh - messagesH)
    if (next !== topPadRef.current) {
      topPadRef.current = next
      setTopPad(next)
    }
  }

  const remeasure = () => {
    scrollRef.current?.remeasure()
    // After layout, recompute pad then remeasure again so the spacer height applies.
    setTimeout(() => {
      syncTopPad()
      scrollRef.current?.remeasure()
      syncCanScroll()
      if (stickRef.current) scrollRef.current?.scrollToBottom()
    }, 0)
  }

  const readAtBottom = () => {
    const view = scrollRef.current
    if (!view) return true
    return isAtBottom(view.getScrollOffset(), view.getBottomOffset(), STICK_SLOP)
  }

  const updateStickFromView = () => {
    setStick(readAtBottom())
    syncCanScroll()
  }

  // Parent layout / terminal resize: ScrollView needs an explicit remeasure after width *and* height change (footer/header row budget shifts).
  useEffect(() => {
    const timer = setTimeout(remeasure, 0)
    return () => clearTimeout(timer)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- remeasure is a fresh closure every render
  }, [columns, rows])

  useEffect(() => {
    if (!stdout) return
    const onResize = () => {
      setTimeout(remeasure, 0)
    }
    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- onResize reads the latest remeasure through the closure of the mounted stdout
  }, [stdout])

  const followIfPinned = () => {
    syncTopPad()
    if (stickRef.current) {
      scrollRef.current?.scrollToBottom()
    }
    syncCanScroll()
  }

  // New messages / streaming tokens: keep the tail in view when pinned.
  useEffect(() => {
    // Let ScrollView measure new children, then pad + follow.
    const timer = setTimeout(followIfPinned, 0)
    return () => clearTimeout(timer)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- followIfPinned is a fresh closure every render
  }, [events, partial, pending, thinking, topPad, bottomChromeKey])

  // Un-stick, run a scroll action, then resync stick/affordance state. No-op when there's nothing to scroll, so it never creates empty overscroll.
  const scrollIfPossible = (maxScroll: number, run: () => void) => {
    if (maxScroll <= 0) return
    setStick(false)
    run()
    updateStickFromView()
  }

  const handleWheelInput = (view: VirtualScrollRef, input: string, maxScroll: number) => {
    const wheel = parseWheelDirection(input)
    if (wheel === "up") scrollIfPossible(maxScroll, () => scrollByClamped(view, -WHEEL_LINES))
    else if (wheel === "down") scrollIfPossible(maxScroll, () => scrollByClamped(view, WHEEL_LINES))
  }

  const handleKeyInput = (
    view: VirtualScrollRef,
    key: Parameters<Parameters<typeof useInput>[0]>[1],
    maxScroll: number
  ) => {
    if (key.ctrl && key.end) {
      setStick(true)
      view.scrollToBottom()
      updateStickFromView()
      return
    }
    const page = Math.max(1, (view.getViewportHeight() || 10) - 1)
    if (key.pageUp) {
      scrollIfPossible(maxScroll, () => scrollByClamped(view, -page))
    } else if (key.pageDown) {
      scrollIfPossible(maxScroll, () => scrollByClamped(view, page))
    } else if (key.ctrl && key.upArrow) {
      scrollIfPossible(maxScroll, () => scrollByClamped(view, -3))
    } else if (key.ctrl && key.downArrow) {
      scrollIfPossible(maxScroll, () => scrollByClamped(view, 3))
    } else if (key.ctrl && key.home) {
      scrollIfPossible(maxScroll, () => clampScrollTo(view, 0))
    }
  }

  const copyLatest = () => {
    const text = lastCopyableText(events)
    if (!text) return
    copyToClipboard(text)
  }
  // The key bar's Copy button asks through uiEvents; an effect event keeps the listener on the latest events
  const copy = useEffectEvent(copyLatest)
  useEffect(() => {
    const onCopy = () => copy()
    uiEvents.on("copy", onCopy)
    return () => {
      uiEvents.off("copy", onCopy)
    }
  }, [])

  // Nothing to scroll (getBottomOffset 0): the handlers keep stick and don't create empty overscroll
  useInput((_input, key) => {
    const view = scrollRef.current
    if (view) handleKeyInput(view, key, view.getBottomOffset())
  })
  useTerminalReports(input => {
    const view = scrollRef.current
    if (view) handleWheelInput(view, input, view.getBottomOffset())
  })

  const showAffordance = canScroll && !stuckToBottom

  // Stable element identities across scroll-tick renders: TimelineItem is memo()ed, and keeping the same elements here also stops the ScrollView's per-item measurement effect (keyed on child identity) from re-running.
  const { timelineItems, lastShown } = useMemo(() => {
    const items = visibleEvents(events, toolDisplay, pending)
    const spaced = spacing(items, thinking)
    return {
      timelineItems: items.map((item, i) => (
        <TimelineItem
          key={item.type === "tool_summary" ? `summary-${idFor(item.last)}` : idFor(item)}
          item={item}
          thinking={thinking}
          spaced={spaced[i]}
        />
      )),
      lastShown: items.findLast(item => itemShows(item, thinking))?.type
    }
  }, [events, thinking, toolDisplay, pending])
  // Spaced like a finished item: after the user's message, or as the agent's words; the spinner sits right under it
  const partialShows = !!partial?.content || (thinking && !!partial?.reasoning)
  const partialSpaced =
    partialShows &&
    (lastShown === "user" || (!!partial?.content && lastShown !== undefined && lastShown !== "reasoning"))

  return (
    <Box
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      minHeight={3}
      marginY={1}
      flexDirection="column"
      overflow="hidden"
      width="100%"
    >
      {showAffordance && (
        <Box flexShrink={0} width="100%">
          <Text dimColor>{t("viewport.older")}</Text>
        </Box>
      )}
      <VirtualScroll
        ref={scrollRef}
        flexGrow={1}
        flexShrink={1}
        width="100%"
        onScroll={() => {
          updateStickFromView()
        }}
        onContentHeightChange={() => {
          followIfPinned()
        }}
        onViewportSizeChange={() => {
          followIfPinned()
        }}
      >
        {/*
          Fills unused viewport rows so messages sit on the bottom edge
          (chat grows upward). Collapses to 0 once history exceeds the pane.
        */}
        {topPad > 0 ? <Box key="top-pad" height={topPad} flexShrink={0} width="100%" /> : null}
        {timelineItems.length === 0 && startupPanel ? <Box key="startup">{startupPanel}</Box> : timelineItems}
        <Box key="partial" flexDirection="column" marginTop={partialSpaced ? 1 : 0}>
          <PartialMessage partial={partial} thinking={thinking} />
        </Box>
        <Box key="activity">
          <Activity
            pending={pending}
            partial={partial}
            thinking={thinking}
            tool={toolDisplay === "minimal" ? currentTool : undefined}
          />
        </Box>
      </VirtualScroll>
    </Box>
  )
}
