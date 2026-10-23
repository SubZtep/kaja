import type { KajaPreferences } from "@kaja/schema/config"
import type { Key } from "ink"
import { type RefObject, useRef, useState } from "react"
import { MODIFIER_BITS, parseHeldModifiers, parseModifierKey, windowFocusReport } from "../lib/terminal-input"
import { useKey } from "./use-key"
import { useTerminalReports } from "./use-terminal-reports"

export type HotkeyModifier = NonNullable<KajaPreferences["hotkeyModifier"]>

// Ink reports Alt as `meta`; the Meta/Super key only arrives as `super`, with the kitty keyboard protocol
const PRESSED = {
  ctrl: key => key.ctrl,
  alt: key => key.meta,
  meta: key => key.super
} satisfies Record<string, (key: Key) => boolean>

// Meta is the Super key or, on a keyboard that has one, the kitty protocol's own Meta
const BITS = { ctrl: MODIFIER_BITS.ctrl, alt: MODIFIER_BITS.alt, meta: MODIFIER_BITS.super | MODIFIER_BITS.meta }

const LABELS = { ctrl: "Ctrl", alt: "Alt", meta: "Meta" }

type Part = keyof typeof PRESSED

const parts = (modifier: HotkeyModifier) => modifier.split("+") as Part[]

/** The key bar's name for a modifier: "Ctrl", "Alt+Meta", … */
export function modifierLabel(modifier: HotkeyModifier = "alt") {
  return parts(modifier)
    .map(part => LABELS[part])
    .join("+")
}

/**
 * The modifier bits held now, from two sources that terminals don't always agree on: each modifier key's own presses
 * and releases (tracked per physical key), and the modifier field of the latest key report. A modifier counts as held
 * if either says so, so the order the keys went down in doesn't matter. Losing the window's focus drops them, since the
 * releases would go to another window. Only a terminal with the kitty keyboard protocol reports any of it; elsewhere
 * this stays 0. `onChange` hears each new value.
 */
function useHeldBits(onChange?: (bits: number) => void): RefObject<number> {
  const bits = useRef(0)
  const down = useRef(new Map<number, number>())
  const reported = useRef(0)
  useTerminalReports(report => {
    const modifierKey = parseModifierKey(report)
    if (modifierKey) {
      if (modifierKey.down) down.current.set(modifierKey.key, modifierKey.bit)
      else down.current.delete(modifierKey.key)
    }
    const fromReport = parseHeldModifiers(report)
    if (fromReport !== null) reported.current = fromReport
    else if (windowFocusReport(report) === "out") {
      down.current.clear()
      reported.current = 0
    } else return
    bits.current = [...down.current.values()].reduce((all, bit) => all | bit, reported.current)
    onChange?.(bits.current)
  })
  return bits
}

const isHeld = (modifier: HotkeyModifier, bits: number) => parts(modifier).every(part => bits & BITS[part])

/**
 * Fires the matching handler on `<modifier>+<letter>`. No modifier is universal in a terminal, so which one to use is
 * user-configurable (`preferences.hotkeyModifier` in settings.toml, defaulting to "alt"): Alt (Ink's `key.meta`) can
 * type special characters instead of acting as a modifier on some macOS terminals (Terminal.app/iTerm2 without "Option
 * as Meta" enabled) — this app's own Alt+Enter (newline) already relies on it working, so it's a reasonable default.
 * Ctrl (`key.ctrl`) is the safer pick there, but can instead collide with host-app global shortcuts (e.g. VS Code's
 * integrated terminal reserves several Ctrl+<letter> combos regardless of which panel has focus). Meta (the Super key,
 * `key.super`) needs a terminal with the kitty keyboard protocol. Two keys at once ("ctrl+meta", …) dodge the
 * collisions of each alone, e.g. a window manager that grabs Ctrl+Alt+<letter> before the terminal sees it. Either the
 * key itself or the held modifiers (see {@link useHeldBits}) can satisfy each key of the modifier, in any order.
 */
export function useModifierKeys(modifier: HotkeyModifier, bindings: Partial<Record<string, () => void>>) {
  const held = useHeldBits()
  useKey((input, key) => {
    if (parts(modifier).every(part => PRESSED[part](key) || held.current & BITS[part])) bindings[input]?.()
  })
}

/** Whether every key of `modifier` is held right now (in any order), for the key bar to light up. */
export function useModifierHeld(modifier: HotkeyModifier = "alt"): boolean {
  const [held, setHeld] = useState(false)
  useHeldBits(bits => setHeld(isHeld(modifier, bits)))
  return held
}
