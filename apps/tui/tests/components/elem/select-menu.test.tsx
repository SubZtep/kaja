import { expect, test } from "bun:test"
import { SelectMenu } from "../../../components/elem/select-menu"
import { renderForTest } from "../../test-utils"

const DOWN = "\x1b[B"
const UP = "\x1b[A"

test("reports each move of the highlight, so a caller can preview the option under it", async () => {
  const focused: number[] = []
  const t = renderForTest(
    <SelectMenu
      items={["Dark", "Light"]}
      onFocus={index => focused.push(index)}
      onSelect={() => {}}
      onClose={() => {}}
    />
  )
  await t.tick()
  await t.press(DOWN)
  await t.press(DOWN) // already on the last: no move, no report
  await t.press(UP)
  expect(focused).toEqual([1, 0])
  t.unmount()
})
