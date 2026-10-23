import { expect, test } from "bun:test"
import { Box } from "ink"
import { ModalHost } from "../../components/elem/modal"
import { CommandModal } from "../../components/layout/command-modal"
import { renderForTest } from "../test-utils"

test("shows the whole command, however long it is for the chat's preview", async () => {
  const command = Array.from({ length: 8 }, (_, i) => `echo line${i}`).join("\n")
  const t = renderForTest(
    <ModalHost>
      <Box height={40}>
        <CommandModal command={command} kind="command" onClose={() => {}} />
      </Box>
    </ModalHost>,
    { rows: 40 }
  )
  await t.tick()
  expect(t.lastFrame()).toContain("Command waiting for approval")
  expect(t.lastFrame()).toContain("line0")
  expect(t.lastFrame()).toContain("line7")
  t.unmount()
  await t.waitUntilExit()
})

test("Esc closes it, and a tool request is titled as one", async () => {
  let closed = 0
  const t = renderForTest(
    <ModalHost>
      <Box height={24}>
        <CommandModal command="POST https://x.test/issues" kind="tool" onClose={() => closed++} />
      </Box>
    </ModalHost>
  )
  await t.tick()
  expect(t.lastFrame()).toContain("Request waiting for approval")
  await t.press("\x1b")
  expect(closed).toBe(1)
  t.unmount()
  await t.waitUntilExit()
})
