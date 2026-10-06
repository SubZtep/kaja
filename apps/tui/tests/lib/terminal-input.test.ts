import { expect, test } from "bun:test"
import {
  colorSchemeReport,
  isIgnoredTerminalInput,
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
