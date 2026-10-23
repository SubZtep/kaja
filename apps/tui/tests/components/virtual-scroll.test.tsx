import { expect, test } from "bun:test"
import { Box, Text } from "ink"
import { createRef } from "react"
import { VirtualScroll, type VirtualScrollRef } from "../../components/elem/virtual-scroll"
import { renderForTest } from "../test-utils"

// Ten two-row items in a three-row viewport
const items = Array.from({ length: 10 }, (_, i) => (
  <Box key={`item-${i}`} flexDirection="column">
    <Text>item-{i}-top</Text>
    <Text>item-{i}-bottom</Text>
  </Box>
))

test("scrolls to row offsets, including partway into an item", async () => {
  const ref = createRef<VirtualScrollRef>()
  const t = renderForTest(
    <Box flexDirection="column" height={3}>
      <VirtualScroll ref={ref} flexGrow={1}>
        {items}
      </VirtualScroll>
    </Box>
  )
  await t.tick()
  await t.tick()
  expect(ref.current?.getContentHeight()).toBe(20)
  expect(ref.current?.getViewportHeight()).toBe(3)

  const rows = () => t.lastFrame().split("\n").filter(Boolean)

  ref.current?.scrollTo(3)
  await t.tick()
  expect(rows()).toEqual(["item-1-bottom", "item-2-top", "item-2-bottom"])

  ref.current?.scrollTo(4)
  await t.tick()
  expect(rows()).toEqual(["item-2-top", "item-2-bottom", "item-3-top"])

  ref.current?.scrollToBottom()
  await t.tick()
  expect(rows()).toEqual(["item-8-bottom", "item-9-top", "item-9-bottom"])

  t.unmount()
  await t.waitUntilExit()
})
