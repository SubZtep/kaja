import { expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CodeViewContext } from "../../components/elem/code-expand"
import { TimelineItem } from "../../components/timeline"
import type { TimelineEvent } from "../../hooks/use-agent"
import { renderForTest } from "../test-utils"

const events: TimelineEvent[] = [
  { type: "user", text: "hello" },
  { type: "reasoning", text: "SECRET-THOUGHTS" },
  { type: "final", content: "world" }
]

test("thinking toggle shows or hides reasoning on re-render", async () => {
  const t = renderForTest(events.map((item, i) => <TimelineItem key={i} item={item} thinking={true} />))
  await t.tick()

  expect(t.output()).toContain("SECRET-THOUGHTS")
  expect(t.output()).toContain("hello")
  expect(t.output()).toContain("world")

  t.rerender(events.map((item, i) => <TimelineItem key={i} item={item} thinking={false} />))
  await t.tick()
  expect(t.lastFrame()).toContain("hello")
  expect(t.lastFrame()).toContain("world")
  expect(t.lastFrame()).not.toContain("SECRET-THOUGHTS")

  t.rerender(events.map((item, i) => <TimelineItem key={i} item={item} thinking={true} />))
  await t.tick()
  expect(t.lastFrame()).toContain("SECRET-THOUGHTS")

  t.unmount()
  await t.waitUntilExit()
})

test("error events render in the timeline", async () => {
  const t = renderForTest(
    <TimelineItem item={{ type: "error", text: "404 Model not found", category: "network" }} thinking={true} />
  )
  await t.tick()
  expect(t.output()).toContain("404 Model not found")

  t.unmount()
  await t.waitUntilExit()
})

test("a tool image renders the picture, not just its path", async () => {
  const path = join(tmpdir(), `kaja-timeline-${Bun.randomUUIDv7()}.png`)
  // A 1×1 red PNG
  await Bun.write(
    path,
    Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    )
  )
  const t = renderForTest(<TimelineItem item={{ type: "tool_image", path, mimeType: "image/png" }} thinking={true} />)
  for (let i = 0; i < 100 && !t.output().includes("▄"); i++) await t.tick()
  expect(t.output()).toContain("▄")
  expect(t.output()).toContain(path)
  t.unmount()
  await t.waitUntilExit()
  await rm(path, { force: true })
})

test("an image that can't load says why after its caption", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("gone", { status: 404 }) })
  const missing = join(tmpdir(), `kaja-timeline-${Bun.randomUUIDv7()}.png`)
  const t = renderForTest(
    <>
      <TimelineItem item={{ type: "tool_image", path: missing, mimeType: "image/png" }} thinking={true} />
      <TimelineItem
        item={{ type: "final", content: `![A cat](http://127.0.0.1:${server.port}/cat.png)` }}
        thinking={true}
      />
    </>,
    { columns: 200 }
  )
  for (let i = 0; i < 100 && !t.output().includes("HTTP 404"); i++) await t.tick()
  expect(t.output()).toContain("A cat (couldn't load: HTTP 404)")
  expect(t.output()).toContain(`[image: ${missing}] (couldn't load: file not found)`)
  t.unmount()
  await t.waitUntilExit()
  await server.stop(true)
})

test("tool calls render as a labelled row, and a summary as one line", async () => {
  const call = { type: "tool_call", name: "read_file", arguments: '{"path":"a.txt"}' } as const
  const t = renderForTest(
    <>
      <TimelineItem item={call} thinking={false} />
      <TimelineItem
        item={{ type: "tool_summary", last: call, names: ["read_file", "fetch_url"], count: 2 }}
        thinking={false}
      />
    </>
  )
  await t.tick()
  expect(t.output()).toContain("a.txt")
  expect(t.output()).toContain("read_file, fetch_url")
  t.unmount()
  await t.waitUntilExit()
})

test("an approval command is cut to the preview lines, and all of it shows once expanded", async () => {
  const command = Array.from({ length: 12 }, (_, i) => `echo line${i}`).join("\n")
  const item = { type: "confirm_command", command, description: "run" } as const
  const t = renderForTest(<TimelineItem item={item} thinking={false} />)
  await t.tick()
  expect(t.output()).toContain("line4")
  expect(t.output()).not.toContain("line5")
  expect(t.output()).toContain("7 more")
  t.rerender(
    <CodeViewContext.Provider value={{ expanded: true, lines: 5 }}>
      <TimelineItem item={item} thinking={false} />
    </CodeViewContext.Provider>
  )
  await t.tick()
  expect(t.lastFrame()).toContain("line11")
  t.unmount()
  await t.waitUntilExit()
})

test("code longer than the preview registers for the expand button, and withdraws on unmount", async () => {
  let active = 0
  const register = () => {
    active++
    return () => {
      active--
    }
  }
  const long = { type: "confirm_command", command: "a\nb\nc\nd\ne\nf\ng", description: "run" } as const
  const short = { type: "confirm_command", command: "a\nb", description: "run" } as const
  const view = { expanded: false, lines: 5, register }
  const t = renderForTest(
    <CodeViewContext.Provider value={view}>
      <TimelineItem item={long} thinking={false} />
      <TimelineItem item={short} thinking={false} />
    </CodeViewContext.Provider>
  )
  await t.tick()
  expect(active).toBe(1)
  t.unmount()
  await t.waitUntilExit()
  expect(active).toBe(0)
})
