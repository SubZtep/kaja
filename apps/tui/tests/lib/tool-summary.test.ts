import { expect, test } from "bun:test"
import type { TimelineEvent } from "../../hooks/use-agent"
import { foldToolCalls } from "../../lib/tool-summary"

const call = (name: string): TimelineEvent => ({ type: "tool_call", name, arguments: "{}" })

const turn: TimelineEvent[] = [
  { type: "user", text: "hi" },
  call("web_search"),
  call("web_search"),
  call("read_file"),
  { type: "final", content: "done" }
]

test("a finished turn's calls fold into one summary before the answer", () => {
  const out = foldToolCalls(turn, false)
  expect(out.map(e => e.type)).toEqual(["user", "tool_summary", "final"])
  expect(out[1]).toMatchObject({ count: 3, names: ["web_search", "read_file"] })
})

test("the running turn gets no summary, earlier turns keep theirs", () => {
  const events = [...turn, { type: "user", text: "more" } as TimelineEvent, call("fetch_url")]
  const out = foldToolCalls(events, true)
  expect(out.map(e => e.type)).toEqual(["user", "tool_summary", "final", "user"])
  expect(foldToolCalls(events, false).at(-1)?.type).toBe("tool_summary")
})

test("turns without calls pass through", () => {
  const events: TimelineEvent[] = [
    { type: "user", text: "hi" },
    { type: "final", content: "yo" }
  ]
  expect(foldToolCalls(events, false)).toEqual(events)
})
