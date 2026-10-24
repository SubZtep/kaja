import { expect, spyOn, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Box } from "ink"
import { ChatViewport } from "../../components/layout/chat-viewport"
import type { TimelineEvent } from "../../hooks/use-agent"
import * as renderImage from "../../lib/image/render-terminal-image"
import { uiEvents } from "../../lib/ui-events"
import { png } from "../fixtures/images"
import { renderForTest } from "../test-utils"

// Tall enough that the picture and the reply under it don't both fit the viewport
const IMAGE = join(tmpdir(), `kaja-chat-viewport-${Bun.randomUUIDv7()}.png`)
await Bun.write(IMAGE, await png(400, 200))

const REF = "kaja-image:31839a12bfc0426e"
/** How long a picture takes to arrive, well past the point where the chat has settled around its alt text. */
const ARRIVAL_MS = 300
const PICTURE = "▄"

/**
 * Every picture takes {@link ARRIVAL_MS} to arrive, the slow ones that leave the chat scrolling under a row that isn't
 * drawn yet.
 */
function slowArrivals() {
  const real = renderImage.renderTerminalImage
  return spyOn(renderImage, "renderTerminalImage").mockImplementation(
    (src, options) =>
      new Promise(resolve => {
        setTimeout(() => void real(src, options).then(resolve), ARRIVAL_MS)
      })
  )
}

function render(events: TimelineEvent[]) {
  return renderForTest(
    <Box flexDirection="column" width={120} height={30}>
      <ChatViewport persona="Kaja" events={events} thinking={false} partial={null} pending={false} />
    </Box>,
    { columns: 120, rows: 30 }
  )
}

/** Once the pictures have had their time to arrive: nothing painted since, or the chat is still moving. */
async function settledAfter(t: { output: () => string; tick: () => Promise<void> }) {
  await Bun.sleep(ARRIVAL_MS + 400)
  await t.tick()
  const settled = t.output().length
  await Bun.sleep(400)
  expect(t.output()).toHaveLength(settled)
}

// A turn ending with the agent showing a picture: the tool's own row, then the reply pointing at it
const turn: TimelineEvent[] = [
  { type: "user", text: "what's the first picture on 444.hu?" },
  { type: "reasoning", text: "hidden thinking" },
  { type: "tool_call", name: "fetch_url", arguments: '{"url": "https://444.hu"}' },
  { type: "message", content: "The first article is about PE class. Here is the lead image:" },
  { type: "tool_call", name: "view_image", arguments: '{"path": "/tmp/444_first.jpeg"}' },
  { type: "tool_image", mimeType: "image/png", path: IMAGE, ref: REF, alt: "Viewing image: /tmp/444_first.jpeg" },
  {
    type: "final",
    content: `![First image on 444.hu](${IMAGE})\n\nThe lead picture is the hero image of the top article.`
  }
]

test("a picture arriving leaves the reply under it in view, and the chat settles", async () => {
  const arrivals = slowArrivals()
  const t = render(turn)
  await t.tick()

  await settledAfter(t)

  // The picture fills most of the viewport, so the reply under it has to be followed to, or the chat reads as frozen
  expect(t.lastFrame()).toContain(PICTURE)
  expect(t.lastFrame()).toContain("lead picture is the hero image")

  arrivals.mockRestore()
  t.unmount()
  await t.waitUntilExit()
})

test("an image row that scrolls out of the window and back comes back with its picture, and the chat settles", async () => {
  // Enough history after the picture that scrolling up leaves it outside the window, which unmounts its row
  const filler = (count: number, from: number): TimelineEvent[] =>
    Array.from({ length: count }, (_, i) => ({
      type: "message" as const,
      content: `line-${from + i}-wraps-and-takes-height`
    }))
  const arrivals = slowArrivals()
  const t = render([
    ...filler(40, 0),
    { type: "tool_image", mimeType: "image/png", path: IMAGE, ref: REF, alt: "a picture" },
    ...filler(10, 100)
  ])
  await t.tick()
  await settledAfter(t)
  expect(t.lastFrame()).toContain(PICTURE)

  await t.press("\x1b[5~") // page up, the row's window left behind
  await t.press("\x1b[5~")
  expect(t.lastFrame()).not.toContain(PICTURE)

  // Coming back mounts the row again. A picture kept only in the row's own state would come back blank, the row
  // would measure its alt text instead, and the chat would scroll it out of the window once more — the picture
  // flickering forever over a viewport that never settles.
  uiEvents.emit("follow")
  await settledAfter(t)
  expect(t.lastFrame()).toContain(PICTURE)

  arrivals.mockRestore()
  t.unmount()
  await t.waitUntilExit()
})
