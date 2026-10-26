import { expect, test } from "bun:test"
import { Text } from "ink"
import { type HotkeyModifier, modifierLabel, useModifierHeld, useModifierKeys } from "../../src/hooks/use-modifier-keys"
import { renderForTest } from "../test-utils"

function Harness({ modifier, presses }: { modifier: HotkeyModifier; presses: string[] }) {
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

// Kitty keyboard protocol: CSI codepoint ; (modifier bits + 1) u, with shift 1, alt 2, ctrl 4, super 8
const kitty = (letter: string, bits: number) => `\x1b[${letter.codePointAt(0)};${bits + 1}u`

test('modifier "meta" fires on Super+<letter> only', async () => {
  const presses: string[] = []
  const t = renderForTest(<Harness modifier="meta" presses={presses} />)
  await t.tick()

  await t.press(kitty("p", 8)) // Super+P
  await t.press(kitty("p", 2)) // Alt+P — wrong modifier
  await t.press(kitty("p", 4)) // Ctrl+P — wrong modifier

  expect(presses).toEqual(["p"])

  t.unmount()
  await t.waitUntilExit()
})

test.each([
  ["ctrl+alt", 4 + 2, [8, 4, 2]],
  ["ctrl+meta", 4 + 8, [2, 4, 8]],
  ["alt+meta", 2 + 8, [4, 2, 8]]
] as const)('modifier "%s" fires only with both keys held', async (modifier, both, singles) => {
  const presses: string[] = []
  const t = renderForTest(<Harness modifier={modifier} presses={presses} />)
  await t.tick()

  await t.press(kitty("p", both))
  for (const bits of singles) await t.press(kitty("p", bits)) // one key, or the wrong pair

  expect(presses).toEqual(["p"])

  t.unmount()
  await t.waitUntilExit()
})

test("modifierLabel joins the keys' names; alt without a setting", () => {
  expect(modifierLabel()).toBe("Alt")
  expect(modifierLabel("ctrl+meta")).toBe("Ctrl+Meta")
})

test("a key release doesn't fire a hotkey a second time", async () => {
  const presses: string[] = []
  const t = renderForTest(<Harness modifier="ctrl" presses={presses} />)
  await t.tick()

  await t.press("\x1b[112;5u") // Ctrl+P down
  await t.press("\x1b[112;5:3u") // Ctrl+P up

  expect(presses).toEqual(["p"])

  t.unmount()
  await t.waitUntilExit()
})

function HeldProbe({ modifier }: { modifier: HotkeyModifier }) {
  return <Text>{useModifierHeld(modifier) ? "held" : "free"}</Text>
}

test("useModifierHeld follows the modifier keys' presses and releases, and drops them on losing focus", async () => {
  const t = renderForTest(<HeldProbe modifier="ctrl+meta" />)
  await t.tick()
  expect(t.lastFrame()).toContain("free")

  await t.press("\x1b[57442;5u") // Ctrl down
  expect(t.lastFrame()).toContain("free") // only one of the two
  await t.press("\x1b[57444;13u") // Super down, Ctrl still down
  expect(t.lastFrame()).toContain("held")
  await t.press("\x1b[57444;5:3u") // Super up
  expect(t.lastFrame()).toContain("free")

  await t.press("\x1b[57444;13u")
  expect(t.lastFrame()).toContain("held")
  await t.press("\x1b[O") // window lost focus: the releases go elsewhere
  expect(t.lastFrame()).toContain("free")

  t.unmount()
  await t.waitUntilExit()
})

test.each([
  ["Ctrl then Super", ["\x1b[57442;5u", "\x1b[57444;9u"]],
  ["Super then Ctrl", ["\x1b[57444;9u", "\x1b[57442;5u"]]
])("%s counts the same even when the terminal reports only the last key held", async (_order, downs) => {
  const presses: string[] = []
  const t = renderForTest(
    <>
      <Harness modifier="ctrl+meta" presses={presses} />
      <HeldProbe modifier="ctrl+meta" />
    </>
  )
  await t.tick()

  for (const down of downs) await t.press(down)
  expect(t.lastFrame()).toContain("held")
  await t.press("\x1b[112;1u") // P, reported with no modifier bits at all
  expect(presses).toEqual(["p"])

  await t.press("\x1b[57442;1:3u") // Ctrl up
  expect(t.lastFrame()).toContain("free")

  t.unmount()
  await t.waitUntilExit()
})
