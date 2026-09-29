import type { TimelineEvent } from "../hooks/use-agent"

/** A finished turn's tool calls folded into one line (minimal `toolDisplay`); `last` is the turn's final call, whose identity keys the row. */
export type ToolSummary = { type: "tool_summary"; last: TimelineEvent; names: string[]; count: number }

export type DisplayEvent = TimelineEvent | ToolSummary

type ToolCallEvent = Extract<TimelineEvent, { type: "tool_call" | "client_tool_call" }>

const isToolCall = (event: TimelineEvent): event is ToolCallEvent =>
  event.type === "tool_call" || event.type === "client_tool_call"

/**
 * Minimal display: replaces each turn's tool calls with one summary where its last call was. A turn runs from one user
 * message to the next; the one still running gets no summary, since the live activity row shows its current call.
 */
export function foldToolCalls(events: TimelineEvent[], pending: boolean): DisplayEvent[] {
  const out: DisplayEvent[] = []
  let start = 0
  while (start < events.length) {
    let end = events.findIndex((event, i) => i > start && event.type === "user")
    if (end < 0) end = events.length
    const turn = events.slice(start, end)
    const calls = turn.filter(isToolCall)
    const last = calls.at(-1)
    const running = pending && end === events.length
    for (const event of turn) {
      if (!isToolCall(event)) out.push(event)
      else if (event === last && !running)
        out.push({ type: "tool_summary", last, names: [...new Set(calls.map(c => c.name))], count: calls.length })
    }
    start = end
  }
  return out
}
