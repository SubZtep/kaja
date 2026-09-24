import { expect, test } from "bun:test"
import { PartialMessage } from "../../components/elem/partial-message"
import { renderForTest } from "../test-utils"

test("streaming content renders as markdown, and an unfinished marker as typed", () => {
  const t = renderForTest(
    <PartialMessage partial={{ reasoning: "", content: "Done **now**.\n\nStill **typi" }} thinking={false} />
  )
  const frame = t.lastFrame() ?? ""
  expect(frame).toContain("Done now.")
  expect(frame).toContain("Still **typi")
  t.unmount()
})
