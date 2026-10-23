import { expect, test } from "bun:test"
import { Box } from "ink"
import { ModalHost } from "../../components/elem/modal"
import { HelpModal } from "../../components/layout/help-modal"
import { renderForTest } from "../test-utils"

test("Enter opens the docs, Esc closes", async () => {
  let opened = 0
  let closed = 0
  const t = renderForTest(
    <ModalHost>
      <Box height={24}>
        <HelpModal
          modifier="Alt"
          persona
          docsUrl="https://docs.kaja.io/using/tui/"
          onOpenDocs={() => opened++}
          onClose={() => closed++}
        />
      </Box>
    </ModalHost>
  )
  await t.tick()
  expect(t.lastFrame()).toContain("Alt+P")

  await t.press("\r")
  expect(opened).toBe(1)

  await t.press("\x1b")
  expect(closed).toBe(1)

  t.unmount()
  await t.waitUntilExit()
})
