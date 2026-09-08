import { expect, test } from "bun:test"
import {
  isDeviceAttributesReply,
  isIgnoredTerminalInput,
  isKittyKeyboardNoise,
  isTerminalMouseSequence,
  parseWheelDirection
} from "../../lib/terminal-input"

test("detects SGR mouse sequences (ESC stripped as useInput sees them)", () => {
  expect(isTerminalMouseSequence("[<64;10;5M]")).toBeFalse()
  expect(isTerminalMouseSequence("[<64;10;5M")).toBeTrue()
  expect(isTerminalMouseSequence("[<65;1;1m")).toBeTrue()
  expect(isTerminalMouseSequence("[<0;10;5M")).toBeTrue()
  expect(isTerminalMouseSequence("hello")).toBeFalse()
  expect(isTerminalMouseSequence("")).toBeFalse()
})

test("parses wheel up/down from SGR button codes", () => {
  expect(parseWheelDirection("[<64;10;5M")).toBe("up")
  expect(parseWheelDirection("[<65;10;5M")).toBe("down")
  expect(parseWheelDirection("[<0;10;5M")).toBeNull()
  expect(parseWheelDirection("t")).toBeNull()
})

test("kitty keyboard replies are noise (not typed into the prompt)", () => {
  // What the user saw prefilled: terminal reply after protocol query/enable
  expect(isKittyKeyboardNoise("[?0u")).toBeTrue()
  expect(isKittyKeyboardNoise("[?1u")).toBeTrue()
  expect(isKittyKeyboardNoise("[>1u")).toBeTrue()
  expect(isIgnoredTerminalInput("[?0u")).toBeTrue()
  expect(isIgnoredTerminalInput("hello")).toBeFalse()
  expect(isIgnoredTerminalInput("/")).toBeFalse()
})

test("device attributes replies are noise (not typed into the prompt)", () => {
  // What the user saw prefilled: terminal reply to a DA1 query (\x1b[c)
  expect(isDeviceAttributesReply("[?1;2c")).toBeTrue()
  expect(isDeviceAttributesReply("[?63;1;2;6c")).toBeTrue()
  expect(isDeviceAttributesReply("[?6c")).toBeTrue()
  expect(isDeviceAttributesReply("hello")).toBeFalse()
  expect(isDeviceAttributesReply("")).toBeFalse()
  expect(isIgnoredTerminalInput("[?1;2c")).toBeTrue()
})
