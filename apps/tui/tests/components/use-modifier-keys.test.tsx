import { expect, test } from "bun:test"
import { Text } from "ink"
import { useModifierKeys } from "../../hooks/use-modifier-keys"
import { renderForTest } from "../test-utils"

function Harness({ modifier, presses }: { modifier: "alt" | "ctrl"; presses: string[] }) {
  useModifierKeys(modifier, {
    h: () => presses.push("h"),
    p: () => presses.push("p")
  })
  return <Text>ready</Text>
}

test('modifier "alt" fires on Alt+<letter>, ignores Ctrl+<letter> and plain typing', async () => {
  const presses: string[] = []
  const t = renderForTest(<Harness modifier="alt" presses={presses} />)
  await t.tick()

  await t.press("\x1bh") // Alt+H
  await t.press("\x1bp") // Alt+P
  await t.press("\x10") // Ctrl+P — wrong modifier, not bound
  await t.press("h") // plain "h" — not bound

  expect(presses).toEqual(["h", "p"])

  t.unmount()
  await t.waitUntilExit()
})

test('modifier "ctrl" fires on Ctrl+<letter>, ignores Alt+<letter>', async () => {
  const presses: string[] = []
  const t = renderForTest(<Harness modifier="ctrl" presses={presses} />)
  await t.tick()

  // Ctrl+H (0x08) is indistinguishable from backspace at the byte level, so Ink never
  // reports it as key.ctrl+"h" — this binding just never fires for it, documented here
  // rather than silently surprising someone who picks "h" as a ctrl-mode binding.
  await t.press("\x08")
  await t.press("\x10") // Ctrl+P
  await t.press("\x1bh") // Alt+H — wrong modifier, not bound

  expect(presses).toEqual(["p"])

  t.unmount()
  await t.waitUntilExit()
})
