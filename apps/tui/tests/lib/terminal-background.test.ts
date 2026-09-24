import { describe, expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import {
  brightnessFromColorFgBg,
  brightnessFromOsc11,
  queryTerminalBackground,
  resolveTheme
} from "../../lib/terminal-background"

const ESC = "\u001b"

describe("brightnessFromOsc11", () => {
  test("reads 16-bit and 8-bit channels, BEL or ST terminated", () => {
    expect(brightnessFromOsc11(`${ESC}]11;rgb:ffff/ffff/ffff${ESC}\\`)).toBe("light")
    expect(brightnessFromOsc11(`${ESC}]11;rgb:1e/1e/2e\u0007`)).toBe("dark")
    expect(brightnessFromOsc11(`${ESC}]11;rgba:fafa/f4f4/eded/ffff${ESC}\\`)).toBe("light")
  })

  test("null without a reply", () => {
    expect(brightnessFromOsc11(`${ESC}[?62;22c`)).toBeNull()
  })
})

describe("brightnessFromColorFgBg", () => {
  test("uses the last field as the background", () => {
    expect(brightnessFromColorFgBg("15;0")).toBe("dark")
    expect(brightnessFromColorFgBg("0;15")).toBe("light")
    expect(brightnessFromColorFgBg("0;default;7")).toBe("light")
  })

  test("null when unset or not a number", () => {
    expect(brightnessFromColorFgBg(undefined)).toBeNull()
    expect(brightnessFromColorFgBg("default;default")).toBeNull()
  })
})

// A fake TTY pair: whatever the app writes to stdout, `answer` replies to on stdin
function fakeTerminal(answer: string | null) {
  const stdin = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => stdin })
  const stdout = Object.assign(new PassThrough(), { isTTY: true })
  stdout.on("data", () => {
    if (answer !== null) stdin.write(answer)
  })
  return { stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream }
}

describe("queryTerminalBackground", () => {
  test("reads the OSC 11 reply, finishing on the DA1 reply", async () => {
    const { stdin, stdout } = fakeTerminal(`${ESC}]11;rgb:ffff/ffff/ffff${ESC}\\${ESC}[?62;22c`)
    expect(await queryTerminalBackground(stdin, stdout, 10_000)).toBe("light")
  })

  test("null when the terminal only answers DA1", async () => {
    const { stdin, stdout } = fakeTerminal(`${ESC}[?1;2c`)
    expect(await queryTerminalBackground(stdin, stdout, 10_000)).toBeNull()
  })

  test("null after the timeout when nothing answers", async () => {
    const { stdin, stdout } = fakeTerminal(null)
    expect(await queryTerminalBackground(stdin, stdout, 50)).toBeNull()
  })
})

test("resolveTheme keeps an explicit choice", async () => {
  expect(await resolveTheme("light")).toBe("light")
  expect(await resolveTheme("dark")).toBe("dark")
})
