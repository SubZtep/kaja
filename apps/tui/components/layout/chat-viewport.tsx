import { Box, type Key, Text, useStdout, useWindowSize } from "ink"
import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import type { PartialMessage as PartialMessageData, TimelineEvent } from "../../hooks/use-agent"
import { useInputBlocked } from "../../hooks/use-input-blocked"
import { useKey } from "../../hooks/use-key"
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
import { TitleRule } from "../elem/rule"
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

/**
 * How each item sits: a user message after a blank line; the agent's first item after it under a rule naming the
 * persona (`turn`, the persona in effect then), spaced above the rule; then each of the agent's words after a blank
 * line (except straight under the reasoning that led to them), so tool calls and notices stack without gaps. Reasoning
 * hidden by `thinking` doesn't count.
 */
function layout(items: DisplayEvent[], thinking: boolean, startPersona: string) {
  let previous: DisplayEvent["type"] | undefined
  let persona = startPersona
  return items.map(item => {
    const turn = previous === "user" && item.type !== "user" && itemShows(item, thinking) ? persona : undefined
    const spaced =
      item.type === "user"
        ? previous !== undefined
        : turn === undefined && SAID.has(item.type) && previous !== undefined && previous !== "reasoning"
    if (item.type === "persona_switch") persona = item.label
    if (itemShows(item, thinking)) previous = item.type
    return { spaced, turn, persona }
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

/** One page of rows, less one so a line of context carries over. */
function pageRows(view: VirtualScrollRef) {
  return Math.max(1, (view.getViewportHeight() || 10) - 1)
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
 * Key ownership (chat vs text field): PageUp/Down, Ctrl+↑/↓, Ctrl+Home, mouse wheel → this viewport ↑/↓, ←/→,
 * Home/End (no ctrl), Ctrl+←/→ → TextInput cursor Ctrl+T → mic the copy button / <modifier>+R (app.tsx) → uiEvents
 * "copy" → this viewport copies the latest message
 *
 * Stick-to-bottom uses a small slop so streaming near the end stays pinned.
 */
export function ChatViewport({
  persona,
  events,
  thinking,
  partial,
  pending,
  bottomChromeKey,
  startupPanel,
  toolDisplay = "minimal",
  currentTool
}: Readonly<{
  /** The active persona's name, for the rule over each of the agent's turns. */
  persona: string
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
  /** How far down the history the view sits, 0 at the very top. */
  const [scrollPercent, setScrollPercent] = useState(100)
  /** Extra rows above the messages so short history sits on the bottom edge. */
  const [topPad, setTopPad] = useState(0)
  const { columns, rows } = useWindowSize()
  const { stdout } = useStdout()
  // The persona the conversation began with: turns before the first switch were its
  const [startPersona, setStartPersona] = useState(persona)
  if (startPersona !== persona && !events.some(event => event.type === "persona_switch")) setStartPersona(persona)
  const ruleWidth = Math.max(0, columns - 2)

  useMouseTracking(true)

  const setStick = (next: boolean) => {
    stickRef.current = next
    setStuckToBottom(next)
  }

  const syncCanScroll = () => {
    const view = scrollRef.current
    if (!view) return
    const bottom = view.getBottomOffset()
    setCanScroll(bottom > 0)
    setScrollPercent(bottom > 0 ? Math.floor((view.getScrollOffset() / bottom) * 100) : 100)
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

  const handleKeyInput = (view: VirtualScrollRef, key: Key, maxScroll: number) => {
    const page = pageRows(view)
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
  // The key bar's buttons ask through uiEvents; effect events keep the listeners on the latest state
  const copy = useEffectEvent(copyLatest)
  const pageUp = useEffectEvent(() => {
    const view = scrollRef.current
    if (view) scrollIfPossible(view.getBottomOffset(), () => scrollByClamped(view, -pageRows(view)))
  })
  const pageDown = useEffectEvent(() => {
    const view = scrollRef.current
    if (view) scrollIfPossible(view.getBottomOffset(), () => scrollByClamped(view, pageRows(view)))
  })
  const follow = useEffectEvent(() => {
    const view = scrollRef.current
    if (!view || stickRef.current) return
    setStick(true)
    view.scrollToBottom()
    updateStickFromView()
  })
  useEffect(() => {
    const onCopy = () => copy()
    const onPageUp = () => pageUp()
    const onPageDown = () => pageDown()
    const onFollow = () => follow()
    uiEvents.on("copy", onCopy)
    uiEvents.on("pageUp", onPageUp)
    uiEvents.on("pageDown", onPageDown)
    uiEvents.on("follow", onFollow)
    return () => {
      uiEvents.off("copy", onCopy)
      uiEvents.off("pageUp", onPageUp)
      uiEvents.off("pageDown", onPageDown)
      uiEvents.off("follow", onFollow)
    }
  }, [])

  // Nothing to scroll (getBottomOffset 0): the handlers keep stick and don't create empty overscroll
  useKey((_input, key) => {
    const view = scrollRef.current
    if (view) handleKeyInput(view, key, view.getBottomOffset())
  })
  const blocked = useInputBlocked()
  useTerminalReports(input => {
    const view = scrollRef.current
    if (view) handleWheelInput(view, input, view.getBottomOffset())
  }, !blocked)

  const showAffordance = canScroll && !stuckToBottom

  // Stable element identities across scroll-tick renders: TimelineItem is memo()ed, and keeping the same elements here also stops the ScrollView's per-item measurement effect (keyed on child identity) from re-running.
  const {
    timelineItems,
    lastShown,
    persona: turnPersona
  } = useMemo(() => {
    const items = visibleEvents(events, toolDisplay, pending)
    const placed = layout(items, thinking, startPersona)
    return {
      timelineItems: items.flatMap((item, i) => {
        const key = item.type === "tool_summary" ? `summary-${idFor(item.last)}` : idFor(item)
        const { spaced, turn } = placed[i]!
        return [
          ...(turn === undefined
            ? []
            : [
                <Box key={`turn-${key}`} marginTop={1}>
                  <TitleRule title={turn} width={ruleWidth} />
                </Box>
              ]),
          <TimelineItem key={key} item={item} thinking={thinking} spaced={spaced} />
        ]
      }),
      lastShown: items.findLast(item => itemShows(item, thinking))?.type,
      persona: placed.at(-1)?.persona ?? startPersona
    }
  }, [events, thinking, toolDisplay, pending, startPersona, ruleWidth])
  const partialShows = !!partial?.content || (thinking && !!partial?.reasoning)
  // The turn under way gets its rule as soon as it starts, before anything has arrived
  const turnOpen = lastShown === "user" && (pending || partialShows)
  // The agent's words a blank line apart, except straight under the rule or the reasoning; the spinner sits right under it
  const partialSpaced =
    partialShows && !turnOpen && !!partial?.content && lastShown !== undefined && lastShown !== "reasoning"

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
      paddingX={1}
    >
      {showAffordance && (
        <Box flexShrink={0} width="100%">
          <Text dimColor>{t("viewport.scrolledBack", { percent: scrollPercent })}</Text>
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
        {turnOpen ? (
          <Box key="turn-open" marginTop={1}>
            <TitleRule title={turnPersona} width={ruleWidth} />
          </Box>
        ) : null}
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
