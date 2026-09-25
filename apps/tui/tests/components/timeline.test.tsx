import { expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
  const t = renderForTest(<TimelineItem item={{ type: "tool_image", path }} thinking={true} />)
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
      <TimelineItem item={{ type: "tool_image", path: missing }} thinking={true} />
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
