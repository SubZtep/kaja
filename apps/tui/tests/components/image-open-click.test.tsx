import { expect, mock, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Box } from "ink"
import { ChatViewport } from "../../components/layout/chat-viewport"
import type { TimelineEvent } from "../../hooks/use-agent"
import { png } from "../fixtures/images"
import { renderForTest } from "../test-utils"

const opened: string[] = []
mock.module("../../lib/image/open-image", () => ({
  openImage: async (target: string) => {
    opened.push(target)
    return true
  }
}))

const IMAGE = join(tmpdir(), `kaja-open-click-${Bun.randomUUIDv7()}.png`)
await Bun.write(IMAGE, await png(400, 200))

const press = (col: number, row: number) => `\u001B[<0;${col + 1};${row + 1}M`

test("a click on the open link of an image in the chat opens the image", async () => {
  const events: TimelineEvent[] = [
    ...Array.from({ length: 30 }, (_, i) => ({ type: "message" as const, content: `earlier line ${i}` })),
    { type: "user", text: "show me" },
    { type: "tool_image", mimeType: "image/png", path: IMAGE, ref: "kaja-image:abc", alt: "a picture" },
    { type: "final", content: "there it is" }
  ]
  const t = renderForTest(
    <Box flexDirection="column" width={120} height={30}>
      <ChatViewport events={events} thinking={false} partial={null} pending={false} sounds={false} />
    </Box>,
    { columns: 120, rows: 30 }
  )
  await t.tick()
  await Bun.sleep(500)
  await t.tick()
  const lines = t.lastFrame().split("\n")
  const row = lines.findIndex(line => line.includes("open"))
  expect(row).toBeGreaterThanOrEqual(0)
  const col = lines[row]!.indexOf("open")
  await t.press(press(col, row))
  expect(opened).toEqual([IMAGE])
  t.unmount()
  await t.waitUntilExit()
})
