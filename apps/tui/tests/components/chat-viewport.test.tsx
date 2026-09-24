import { expect, spyOn, test } from "bun:test"
import { Box } from "ink"
import * as tinyclip from "tinyclip"
import { ChatViewport } from "../../components/layout/chat-viewport"
import type { TimelineEvent } from "../../hooks/use-agent"
import * as dedentModule from "../../lib/markdown/dedent"
import { renderForTest } from "../test-utils"

const many: TimelineEvent[] = Array.from({ length: 40 }, (_, i) => ({
  type: "user" as const,
  text: `line-${i}-padding-to-force-wrap-and-height`
}))

test("shows recent history and page-up reveals older lines", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport events={many} thinking={false} partial={null} pending={false} sounds={false} hotkeyModifier="alt" />
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

test("<modifier>+R copies the most recent message to the clipboard, following hotkeyModifier", async () => {
  const events: TimelineEvent[] = [
    { type: "user", text: "hi" },
    { type: "final", content: "here's the answer" }
  ]

  // hotkeyModifier: "alt" — Alt+R fires, Ctrl+R (wrong modifier) does not.
  const altSpy = spyOn(tinyclip, "writeText").mockResolvedValue(undefined)
  const altT = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport
        events={events}
        thinking={false}
        partial={null}
        pending={false}
        sounds={false}
        hotkeyModifier="alt"
      />
    </Box>
  )
  await altT.tick()
  await altT.press("\x12") // Ctrl+R — wrong modifier, must not fire
  await altT.tick()
  expect(altSpy).not.toHaveBeenCalled()
  await altT.press("\x1br") // Alt+R
  await altT.tick()
  expect(altSpy).toHaveBeenCalledWith("here's the answer")
  altSpy.mockRestore()
  altT.unmount()
  await altT.waitUntilExit()

  // hotkeyModifier: "ctrl" — Ctrl+R fires instead. Ctrl+C itself is never usable (Ink
  // reserves it globally to quit the app), which is exactly why "R" was chosen over "C".
  const ctrlSpy = spyOn(tinyclip, "writeText").mockResolvedValue(undefined)
  const ctrlT = renderForTest(
    <Box flexDirection="column" width={40} height={12}>
      <ChatViewport
        events={events}
        thinking={false}
        partial={null}
        pending={false}
        sounds={false}
        hotkeyModifier="ctrl"
      />
    </Box>
  )
  await ctrlT.tick()
  await ctrlT.press("\x1br") // Alt+R — wrong modifier now, must not fire
  await ctrlT.tick()
  expect(ctrlSpy).not.toHaveBeenCalled()
  await ctrlT.press("\x12") // Ctrl+R
  await ctrlT.tick()
  expect(ctrlSpy).toHaveBeenCalledWith("here's the answer")
  ctrlSpy.mockRestore()
  ctrlT.unmount()
  await ctrlT.waitUntilExit()
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
      <ChatViewport
        events={mdEvents}
        thinking={false}
        partial={null}
        pending={false}
        sounds={false}
        hotkeyModifier="alt"
      />
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
