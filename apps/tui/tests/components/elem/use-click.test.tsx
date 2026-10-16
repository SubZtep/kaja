import { expect, test } from "bun:test"
import { Box, type DOMElement, Text } from "ink"
import { useRef } from "react"
import { useClick } from "../../../components/elem/use-click"
import { renderForTest } from "../../test-utils"

// A press at screen column `col`, row `row` (0-based), as an SGR mouse report.
const press = (col: number, row: number) => `\u001B[<0;${col + 1};${row + 1}M`

function Target({ clicks }: Readonly<{ clicks: string[] }>) {
  const ref = useRef<DOMElement>(null)
  useClick(ref, () => clicks.push("open"))
  return (
    <Box ref={ref}>
      <Text>open</Text>
    </Box>
  )
}

test("a press on the box runs it; one beside it doesn't", async () => {
  const clicks: string[] = []
  const t = renderForTest(
    <Box flexDirection="column">
      <Text>first line</Text>
      <Box marginLeft={4}>
        <Target clicks={clicks} />
      </Box>
    </Box>,
    { columns: 40 }
  )
  await t.press(press(0, 1))
  expect(clicks).toEqual([])
  await t.press(press(5, 1))
  expect(clicks).toEqual(["open"])
  t.unmount()
  await t.waitUntilExit()
})

test("inside a scrolled box, the press lands where the box is drawn, and a scrolled-out box takes none", async () => {
  const clicks: string[] = []
  const t = renderForTest(
    <Box flexDirection="column" height={2} overflow="hidden" contentOffsetY={2}>
      <Box flexDirection="column" flexShrink={0}>
        <Text>row 0</Text>
        <Text>row 1</Text>
        <Target clicks={clicks} />
      </Box>
    </Box>,
    { columns: 40 }
  )
  // Laid out at row 2, scrolled up by 2: drawn on row 0
  await t.press(press(1, 2))
  expect(clicks).toEqual([])
  await t.press(press(1, 0))
  expect(clicks).toEqual(["open"])
  t.unmount()
  await t.waitUntilExit()
})
