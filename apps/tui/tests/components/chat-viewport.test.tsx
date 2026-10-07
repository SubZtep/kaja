import { expect, spyOn, test } from "bun:test"
import { Box } from "ink"
import * as tinyclip from "tinyclip"
import { ChatViewport } from "../../components/layout/chat-viewport"
import type { TimelineEvent } from "../../hooks/use-agent"
import * as dedentModule from "../../lib/markdown/dedent"
import { uiEvents } from "../../lib/ui-events"
import { renderForTest } from "../test-utils"

const many: TimelineEvent[] = Array.from({ length: 40 }, (_, i) => ({
  type: "user" as const,
  text: `line-${i}-padding-to-force-wrap-and-height`
}))

test("shows recent history and page-up reveals older lines", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={many} thinking={false} partial={null} pending={false} sounds={false} />
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
  expect(t.lastFrame()).toContain("older")

  // Ctrl+End returns to the bottom and clears the affordance.
  await t.press("\x1b[1;5F")
  await t.tick()
  expect(t.lastFrame()).toContain("line-39")
  expect(t.lastFrame()).not.toContain("older")

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
      <ChatViewport events={events} thinking={false} partial={null} pending={false} sounds={false} />
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
      <ChatViewport events={events} thinking={false} partial={null} pending={true} sounds={false} />
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

test("scrolling doesn't re-parse markdown history (memoized)", async () => {
  const mdEvents: TimelineEvent[] = Array.from({ length: 50 }, (_, i) => ({
    type: "message" as const,
    content: `**msg ${i}** with some *markdown* content, line ${i}`
  }))

  // Every real parse ends in one dedent call; a cache hit makes none
  const parseSpy = spyOn(dedentModule, "dedent")
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={mdEvents} thinking={false} partial={null} pending={false} sounds={false} />
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

test("blank lines only around the user's messages: an agent's run stacks without gaps", async () => {
  const events: TimelineEvent[] = [
    { type: "user", text: "first" },
    { type: "reasoning", text: "hidden" },
    { type: "tool_call", name: "web_search", arguments: "{}" },
    { type: "message", content: "middle" },
    { type: "final", content: "answer" },
    { type: "user", text: "second" }
  ]
  const t = renderForTest(
    <Box flexDirection="column" width={60} height={20}>
      <ChatViewport
        events={events}
        thinking={false}
        partial={null}
        pending={false}
        sounds={false}
        toolDisplay="verbose"
      />
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
    "middle",
    "answer",
    "",
    "second"
  ])

  t.unmount()
  await t.waitUntilExit()
})

test("a reply as wide as the terminal keeps its dot, gap and indent; streaming reasoning sits above the reply", async () => {
  const reply =
    "Haha, vicces! De komolyan, nem szeretnék így szólítani, inkább maradjunk a barátságos hangnemnél. Van becenév?"
  const base: TimelineEvent[] = [{ type: "user", text: "hi" }]
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <ChatViewport
        events={base}
        thinking={true}
        partial={{ content: "Haha", reasoning: "hm" }}
        pending={true}
        sounds={false}
      />
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
        sounds={false}
      />
    </Box>
  )
  await t.tick()
  await t.tick()
  const lines = t.lastFrame().split("\n")
  const first = lines.findIndex(line => line.startsWith("● Haha"))
  expect(first).toBeGreaterThan(-1)
  expect(lines[first + 1]).toMatch(/^ {2}\S/)

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
        sounds={false}
      />
    </Box>,
    { columns: 30 }
  )
  await t.tick()
  await t.tick()

  const lines = t.lastFrame().split("\n")
  const at = lines.findIndex(line => /\d+ ?s/.test(line))
  expect(at).toBeGreaterThan(-1)
  expect(lines[at]).toMatch(/^\S \S/)
  expect(lines[at + 1]?.trim() ?? "").toBe("")

  t.unmount()
  await t.waitUntilExit()
})
