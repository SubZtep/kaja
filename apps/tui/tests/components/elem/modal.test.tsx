import { expect, test } from "bun:test"
import { Box, Text } from "ink"
import { useState } from "react"
import { Backdrop, Modal, ModalHost, paleLine } from "../../../components/elem/modal"
import { useKey } from "../../../hooks/use-key"
import { renderForTest } from "../../test-utils"

function Background({ onKey }: Readonly<{ onKey: (input: string) => void }>) {
  useKey(input => onKey(input))
  return <Text>background</Text>
}

function Screen({ onKey, onClose }: Readonly<{ onKey: (input: string) => void; onClose: () => void }>) {
  const [open, setOpen] = useState(true)
  return (
    <ModalHost>
      <Box height={24} flexDirection="column">
        <Backdrop>
          <Background onKey={onKey} />
        </Backdrop>
        {open && (
          <Modal
            title="Window"
            onClose={() => {
              onClose()
              setOpen(false)
            }}
          >
            <Text>inside the modal</Text>
          </Modal>
        )}
      </Box>
    </ModalHost>
  )
}

test("the background ignores keys while the modal is open, and Esc closes it and gives them back", async () => {
  const keys: string[] = []
  let closed = 0
  const t = renderForTest(<Screen onKey={input => keys.push(input)} onClose={() => closed++} />)
  await t.tick()

  expect(t.lastFrame()).toContain("Window")
  expect(t.lastFrame()).toContain("inside the modal")
  expect(t.lastFrame()).toContain("background")

  await t.press("x")
  expect(keys).toEqual([])

  await t.press("\x1b")
  expect(closed).toBe(1)
  expect(keys).toEqual([])
  expect(t.lastFrame()).not.toContain("inside the modal")

  await t.press("y")
  expect(keys).toEqual(["y"])

  t.unmount()
  await t.waitUntilExit()
})

test("the pale line drops colours and blanks emoji without changing the line's width", () => {
  const line = "\x1b[31m⚙️ Config 🇭🇺 👨‍💻 1️⃣ plain\x1b[39m"
  const out = paleLine(line, text => text)
  expect(out).toBe(`${" ".repeat(2)} Config ${" ".repeat(2)} ${" ".repeat(2)} ${" ".repeat(2)} plain`)
  expect(Bun.stringWidth(out)).toBe(Bun.stringWidth(line))
})
