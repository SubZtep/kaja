import { expect, test } from "bun:test"
import {
  colorSchemeReport,
  isIgnoredTerminalInput,
  MODIFIER_BITS,
  parseHeldModifiers,
  parseModifierKey,
  parseMouse,
  parseWheelDirection,
  splitTerminalReports,
  windowFocusReport
} from "../../lib/terminal-input"

test("splits a raw stdin chunk into its escape sequences, ESC kept, text skipped", () => {
  expect(splitTerminalReports("\x1b[<64;10;5M\x1b[<65;10;5Mhi\x1b[I")).toEqual([
    "\x1b[<64;10;5M",
    "\x1b[<65;10;5M",
    "\x1b[I"
  ])
  expect(splitTerminalReports("\x1b[?997;1n")).toEqual(["\x1b[?997;1n"])
  expect(splitTerminalReports("\x1b[M`!!")).toEqual(["\x1b[M`!!"])
  expect(splitTerminalReports("hello")).toEqual([])
})

test("parses wheel up/down from SGR button codes", () => {
  expect(parseWheelDirection("\x1b[<64;10;5M")).toBe("up")
  expect(parseWheelDirection("[<64;10;5M")).toBe("up")
  expect(parseWheelDirection("[<65;10;5M")).toBe("down")
  expect(parseWheelDirection("[<0;10;5M")).toBeNull()
  expect(parseWheelDirection("t")).toBeNull()
})

test("escape replies mangled into decimal byte lists are noise (not typed into the prompt)", () => {
  // Some multiplexers send `\x1b[?0u` as its byte values; Ink 8 drops the real escape sequences itself
  expect(isIgnoredTerminalInput("27,91,63,48,117")).toBeTrue()
  expect(isIgnoredTerminalInput("27")).toBeFalse()
  expect(isIgnoredTerminalInput("1,2,3")).toBeFalse()
  expect(isIgnoredTerminalInput("hello")).toBeFalse()
  expect(isIgnoredTerminalInput("/")).toBeFalse()
})

test("recognizes window focus-in/out reports", () => {
  expect(windowFocusReport("[I")).toBe("in")
  expect(windowFocusReport("[O")).toBe("out")
  expect(windowFocusReport("\x1b[I")).toBe("in")
  expect(windowFocusReport("hello")).toBeNull()
  expect(windowFocusReport("")).toBeNull()
})

test("recognizes colour-scheme reports", () => {
  expect(colorSchemeReport("[?997;1n")).toBe("dark")
  expect(colorSchemeReport("\x1b[?997;2n")).toBe("light")
  expect(colorSchemeReport("[?997;3n")).toBeNull()
  expect(colorSchemeReport("hello")).toBeNull()
})

test("parseMouse decodes a left press and a button-less move, and ignores wheel and release", () => {
  expect(parseMouse("[<0;5;20M")).toEqual({ kind: "press", col: 4, row: 19 })
  expect(parseMouse("\x1b[<0;5;20M")).toEqual({ kind: "press", col: 4, row: 19 })
  expect(parseMouse("[<35;10;3M")).toEqual({ kind: "move", col: 9, row: 2 })
  expect(parseMouse("[<0;5;20m")).toBeNull()
  expect(parseMouse("[<64;5;20M")).toBeNull()
})

test("a kitty key report says which modifiers are held, a bare modifier press or release included", () => {
  expect(parseHeldModifiers("\x1b[57442;5u")).toBe(MODIFIER_BITS.ctrl) // Ctrl pressed
  expect(parseHeldModifiers("\x1b[57444;13:1u")).toBe(MODIFIER_BITS.ctrl | MODIFIER_BITS.super) // Super pressed, Ctrl down
  expect(parseHeldModifiers("\x1b[57442;1:3u")).toBe(0) // Ctrl released
  expect(parseHeldModifiers("\x1b[112u")).toBe(0) // plain P, no modifier field
  expect(parseHeldModifiers("\x1b[97;2;65u")).toBe(1) // Shift+A with its text
  expect(parseHeldModifiers("\x1b[1;5A")).toBe(MODIFIER_BITS.ctrl) // Ctrl+Up
  expect(parseHeldModifiers("\x1b[3;3~")).toBe(MODIFIER_BITS.alt) // Alt+Delete
})

test("only kitty key reports carry held modifiers: not mouse, focus or cursor-position replies", () => {
  expect(parseHeldModifiers("\x1b[<0;10;5M")).toBeNull()
  expect(parseHeldModifiers("\x1b[I")).toBeNull()
  expect(parseHeldModifiers("\x1b[12;40R")).toBeNull()
  expect(parseHeldModifiers("\x1b[1;5R")).toBeNull()
  expect(parseHeldModifiers("\x1b[?0u")).toBeNull()
})

test("a bare modifier key report names the physical key, its bit and whether it went down", () => {
  expect(parseModifierKey("\x1b[57442;5u")).toEqual({ key: 57442, bit: MODIFIER_BITS.ctrl, down: true })
  expect(parseModifierKey("\x1b[57448;5:2u")).toEqual({ key: 57448, bit: MODIFIER_BITS.ctrl, down: true }) // right Ctrl repeating
  expect(parseModifierKey("\x1b[57444;1:3u")).toEqual({ key: 57444, bit: MODIFIER_BITS.super, down: false })
  expect(parseModifierKey("\x1b[57446;33u")).toEqual({ key: 57446, bit: MODIFIER_BITS.meta, down: true })
  expect(parseModifierKey("\x1b[112;5u")).toBeNull() // Ctrl+P
  expect(parseModifierKey("\x1b[57453;1u")).toBeNull() // ISO level 3 shift is no modifier here
})
