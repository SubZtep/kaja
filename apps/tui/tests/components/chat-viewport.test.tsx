import { expect, spyOn, test } from "bun:test"
import { Box } from "ink"
import * as tinyclip from "tinyclip"
import { ChatViewport } from "../../src/components/layout/chat-viewport"
import type { TimelineEvent } from "../../src/hooks/use-agent"
import * as dedentModule from "../../src/lib/markdown/dedent"
import { uiEvents } from "../../src/lib/ui-events"
import { renderForTest } from "../test-utils"

const many: TimelineEvent[] = Array.from({ length: 40 }, (_, i) => ({
  type: "user" as const,
  text: `line-${i}-padding-to-force-wrap-and-height`
}))

test("the key bar's page-up request scrolls toward older lines", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={many} thinking={false} partial={null} pending={false} />
    </Box>
  )
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("line-39")

  uiEvents.emit("pageUp")
  await t.tick()
  expect(t.lastFrame()).not.toContain("line-39")
  expect(t.lastFrame()).toContain("% of the history")

  // The follow row costs a line of the page, so the way back takes a second press
  uiEvents.emit("pageDown")
  uiEvents.emit("pageDown")
  await t.tick()
  expect(t.lastFrame()).toContain("line-39")
  expect(t.lastFrame()).not.toContain("% of the history")

  t.unmount()
  await t.waitUntilExit()
})

test("shows recent history and page-up reveals older lines", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={many} thinking={false} partial={null} pending={false} />
    </Box>
  )
  await t.tick()
  await t.tick()

  // Pinned to bottom: last lines visible, earliest not necessarily.
  expect(t.lastFrame()).toContain("line-39")
  expect(t.lastFrame()).not.toContain("line-0-padding")

  // Page up should move toward older content and show the follow affordance.
  await t.press("\x1b[5~")
  await t.tick()
  expect(t.lastFrame()).not.toContain("line-39")
  expect(t.lastFrame()).toContain("% of the history")

  // Typing asks the chat to follow again, which clears the affordance.
  uiEvents.emit("follow")
  await t.tick()
  expect(t.lastFrame()).toContain("line-39")
  expect(t.lastFrame()).not.toContain("% of the history")

  t.unmount()
  await t.waitUntilExit()
})

test("the copy event copies the most recent message to the clipboard", async () => {
  const events: TimelineEvent[] = [
    { type: "user", text: "hi" },
    { type: "final", content: "here's the answer" }
  ]
  const spy = spyOn(tinyclip, "writeText").mockResolvedValue(undefined)
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={events} thinking={false} partial={null} pending={false} />
    </Box>
  )
  await t.tick()
  uiEvents.emit("copy")
  await t.tick()
  expect(spy).toHaveBeenCalledWith("here's the answer")
  spy.mockRestore()
  t.unmount()
  await t.waitUntilExit()
})

test("copy takes the agent's latest words, not the user's message that came after them", async () => {
  const events: TimelineEvent[] = [
    { type: "user", text: "first question" },
    { type: "final", content: "the agent's answer" },
    { type: "user", text: "my follow-up" }
  ]
  const spy = spyOn(tinyclip, "writeText").mockResolvedValue(undefined)
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={events} thinking={false} partial={null} pending={true} />
    </Box>
  )
  await t.tick()
  uiEvents.emit("copy")
  await t.tick()
  expect(spy).toHaveBeenCalledWith("the agent's answer")
  spy.mockRestore()
  t.unmount()
  await t.waitUntilExit()
})

test("clicking an agent message copies its own text, not just the latest one", async () => {
  const events: TimelineEvent[] = [
    { type: "final", content: "first reply" },
    { type: "user", text: "follow-up" },
    { type: "final", content: "second reply" }
  ]
  const spy = spyOn(tinyclip, "writeText").mockResolvedValue(undefined)
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={events} thinking={false} partial={null} pending={false} />
    </Box>
  )
  await t.tick()
  await t.tick()
  const lines = t.lastFrame().split("\n")
  const row = lines.findIndex(line => line.includes("first reply"))
  expect(row).toBeGreaterThan(-1)
  const col = lines[row]!.indexOf("first reply")
  await t.press(`\u001B[<0;${col + 1};${row + 1}M`)
  await t.tick()
  expect(spy).toHaveBeenCalledWith("first reply")
  spy.mockRestore()
  t.unmount()
  await t.waitUntilExit()
})

test("scrolling doesn't re-parse markdown history (memoized)", async () => {
  const mdEvents: TimelineEvent[] = Array.from({ length: 50 }, (_, i) => ({
    type: "message" as const,
    content: `**msg ${i}** with some *markdown* content, line ${i}`
  }))

  // Every real parse ends in one dedent call; a cache hit makes none
  const parseSpy = spyOn(dedentModule, "dedent")
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={mdEvents} thinking={false} partial={null} pending={false} />
    </Box>
  )
  await t.tick()
  await t.tick()
  // Mount parses each message once.
  expect(parseSpy.mock.calls.length).toBeGreaterThan(0)

  // Scroll ticks re-render the whole ScrollView subtree — with memoization
  // in place, none of the 50 history items may be re-parsed.
  parseSpy.mockClear()
  await t.press("\x1b[5~")
  await t.tick()
  await t.press("\x1b[5~")
  await t.tick()
  expect(parseSpy).toHaveBeenCalledTimes(0)

  parseSpy.mockRestore()
  t.unmount()
  await t.waitUntilExit()
})

test("blank lines around the user's messages and the agent's words; each turn set apart by a blank line (no rule), tool lines stack under what they follow", async () => {
  const events: TimelineEvent[] = [
    { type: "user", text: "first" },
    { type: "reasoning", text: "hidden" },
    { type: "tool_call", name: "web_search", arguments: "{}" },
    { type: "message", content: "middle" },
    { type: "tool_call", name: "fetch_url", arguments: "{}" },
    { type: "final", content: "answer" },
    { type: "ask_user", question: "which" },
    { type: "user", text: "second" }
  ]
  const t = renderForTest(
    <Box flexDirection="column" width={60} height={20}>
      <ChatViewport events={events} thinking={false} partial={null} pending={false} toolDisplay="verbose" />
    </Box>
  )
  await t.tick()
  await t.tick()

  const lines = t
    .lastFrame()
    .split("\n")
    .map(line => line.trim())
  const from = lines.findIndex(line => line.includes("first"))
  const to = lines.findIndex(line => line.includes("second"))
  expect(lines.slice(from, to + 1).map(line => (line === "" ? "" : line.replace(/^\W+/, "").split(" ")[0]))).toEqual([
    "first",
    "",
    "Searching",
    "",
    "middle",
    "Fetching",
    "",
    "answer",
    "",
    "which",
    "",
    "second"
  ])

  t.unmount()
  await t.waitUntilExit()
})

test("a turn is set apart as soon as it starts, with a blank line and no rule", async () => {
  const before: TimelineEvent[] = [
    { type: "user", text: "one" },
    { type: "final", content: "reply" }
  ]
  const view = (events: TimelineEvent[]) => (
    <Box flexDirection="column" width={60} height={20}>
      <ChatViewport events={events} thinking={false} partial={null} pending={true} />
    </Box>
  )
  const t = renderForTest(view(before), { columns: 60 })
  await t.tick()
  t.rerender(
    view([...before, { type: "persona_switch", personaId: "cat", label: "Grumpy Cat" }, { type: "user", text: "two" }])
  )
  await t.tick()
  await t.tick()
  const frame = t.lastFrame()
  expect(frame).not.toContain("─")
  const lines = frame.split("\n").map(line => line.trim())
  const reply = lines.findIndex(line => line.includes("reply"))
  expect(lines[reply - 1]).toBe("")
  expect(lines[reply - 2]).toContain("one")

  t.unmount()
  await t.waitUntilExit()
})

test("a reply as wide as the terminal keeps its dot, gap and indent; streaming reasoning sits above the reply", async () => {
  const reply =
    "Haha, vicces! De komolyan, nem szeretnék így szólítani, inkább maradjunk a barátságos hangnemnél. Van becenév?"
  const base: TimelineEvent[] = [{ type: "user", text: "hi" }]
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <ChatViewport events={base} thinking={true} partial={{ content: "Haha", reasoning: "hm" }} pending={true} />
    </Box>,
    { columns: 80 }
  )
  await t.tick()
  await t.tick()
  const streaming = t.lastFrame().split("\n")
  expect(streaming.findIndex(line => line.includes("● Haha"))).toBeGreaterThan(
    streaming.findIndex(line => line.includes("hm"))
  )

  t.rerender(
    <Box flexDirection="column" width={80} height={20}>
      <ChatViewport
        events={[...base, { type: "ask_user", question: reply }]}
        thinking={true}
        partial={null}
        pending={false}
      />
    </Box>
  )
  await t.tick()
  await t.tick()
  const lines = t.lastFrame().split("\n")
  const first = lines.findIndex(line => line.startsWith(" ● Haha"))
  expect(first).toBeGreaterThan(-1)
  expect(lines[first + 1]).toMatch(/^ {3}\S/)

  t.unmount()
  await t.waitUntilExit()
})

test("a thinking line wider than the terminal keeps its spinner, gap and one row", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={30} height={12}>
      <ChatViewport
        events={[{ type: "user", text: "hi" }]}
        thinking={false}
        partial={{ content: "", reasoning: "x".repeat(40_000) }}
        pending={true}
      />
    </Box>,
    { columns: 30 }
  )
  await t.tick()
  await t.tick()

  const lines = t.lastFrame().split("\n")
  const at = lines.findIndex(line => /\d+ ?s/.test(line))
  expect(at).toBeGreaterThan(-1)
  expect(lines[at]).toMatch(/^ \S \S/)
  expect(lines[at + 1]?.trim() ?? "").toBe("")

  t.unmount()
  await t.waitUntilExit()
})
