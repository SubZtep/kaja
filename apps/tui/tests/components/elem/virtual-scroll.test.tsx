import { expect, test } from "bun:test"
import { Box, Text } from "ink"
import { useEffect, useLayoutEffect, useState } from "react"
import { useRemeasure, VirtualScroll } from "../../../components/elem/virtual-scroll"
import { renderForTest } from "../../test-utils"

// Grows after mounting, like an image that loads after its alt text
function Growing({ remeasure }: Readonly<{ remeasure: boolean }>) {
  const [grown, setGrown] = useState(false)
  const notify = useRemeasure()
  useEffect(() => {
    setTimeout(() => setGrown(true), 0)
  }, [])
  useLayoutEffect(() => {
    if (grown && remeasure) notify()
  }, [grown, remeasure, notify])
  return (
    <Box flexDirection="column">{grown ? ["a", "b", "c", "d"].map(l => <Text key={l}>{l}</Text>) : <Text>a</Text>}</Box>
  )
}

async function contentHeightAfterGrowth(remeasure: boolean) {
  const heights: number[] = []
  const t = renderForTest(
    <Box flexDirection="column" width={20} height={10}>
      <VirtualScroll ref={null} flexGrow={1} onContentHeightChange={h => heights.push(h)}>
        <Box key="grow">
          <Growing remeasure={remeasure} />
        </Box>
      </VirtualScroll>
    </Box>
  )
  await t.tick()
  await t.tick()
  await t.tick()
  t.unmount()
  await t.waitUntilExit()
  return heights.at(-1)
}

test("an item that grows after mounting reports its new height through useRemeasure", async () => {
  expect(await contentHeightAfterGrowth(false)).toBe(1)
  expect(await contentHeightAfterGrowth(true)).toBe(4)
})
