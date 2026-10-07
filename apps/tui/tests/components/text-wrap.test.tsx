import { expect, test } from "bun:test"
import { Box, Text } from "ink"
import { renderForTest } from "../test-utils"

// patches/ink@8.0.0.patch: Ink's word wrap keeps a line's own indentation but starts no soft-wrapped row with a space
test("a soft-wrapped row doesn't start with the space it broke at", async () => {
  const t = renderForTest(
    <Box width={10} flexDirection="column">
      <Text>aaaaaaaaaa bbb</Text>
      <Text>aaaaaaa{"    "}bbbbbb</Text>
      <Text>
        <Text bold>aaaaaaaaaa</Text> <Text bold>ccc</Text>
      </Text>
      <Text>{"  "}indented</Text>
    </Box>
  )
  await t.tick()

  expect(
    t
      .lastFrame()
      .trimEnd()
      .split("\n")
      .map(line => line.trimEnd())
  ).toEqual(["aaaaaaaaaa", "bbb", "aaaaaaa", "bbbbbb", "aaaaaaaaaa", "ccc", "  indented"])

  t.unmount()
  await t.waitUntilExit()
})
