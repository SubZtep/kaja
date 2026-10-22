import { afterAll, beforeAll, expect, test } from "bun:test"
import { deflateSync } from "node:zlib"
import chalk from "chalk"
import { halfBlocks } from "../../../lib/image/half-blocks"

const level = chalk.level
beforeAll(() => {
  chalk.level = 3
})
afterAll(() => {
  chalk.level = level
})

const RED = [255, 0, 0]
const BLUE = [0, 0, 255]

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = Buffer.concat([Buffer.from(type), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length)
  body.copy(out, 4)
  out.writeUInt32BE(Bun.hash.crc32(body), 8 + data.length)
  return out
}

/** A PNG whose pixels `at` colours, as RGB or (with an alpha) RGBA. */
function pngOf(width: number, height: number, at: (x: number, y: number) => number[]): Uint8Array {
  const channels = at(0, 0).length
  const row = 1 + width * channels
  const raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(at(x, y), y * row + 1 + x * channels)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array())
  ])
}

test("a cell paints its upper pixel as the background and its lower one as the foreground", async () => {
  const out = await halfBlocks(
    pngOf(1, 2, (_, y) => (y === 0 ? RED : BLUE)),
    { width: 1, height: 1 }
  )
  expect(out).toContain("\u001B[48;2;255;0;0m")
  expect(out).toContain("\u001B[38;2;0;0;255m")
  expect(Bun.stripANSI(out)).toBe("▄")
})

test("two pixel rows make one text row, fitted into the box with the aspect ratio kept", async () => {
  const square = (
    await halfBlocks(
      pngOf(40, 40, () => RED),
      { width: 10, height: 10 }
    )
  ).split("\n")
  expect(square).toHaveLength(5)
  expect(Bun.stripANSI(square[0]!)).toHaveLength(10)
  const wide = (
    await halfBlocks(
      pngOf(40, 20, () => RED),
      { width: 10, height: 10 }
    )
  ).split("\n")
  expect([wide.length, Bun.stripANSI(wide[0]!).length]).toEqual([2, 10])
})

test("a transparent upper pixel leaves the background alone", async () => {
  const out = await halfBlocks(
    pngOf(1, 2, () => [200, 60, 30, 0]),
    { width: 1, height: 1 }
  )
  expect(out).not.toContain("\u001B[48;")
  expect(out).toContain("\u001B[38;2;")
})

test("percentages are shares of the terminal", async () => {
  const columns = process.stdout.columns || 80
  const [line] = (
    await halfBlocks(
      pngOf(200, 10, () => RED),
      { width: "50%", height: "100%" }
    )
  ).split("\n")
  expect(Bun.stripANSI(line!)).toHaveLength(Math.floor(columns / 2))
})

test("bad input is rejected rather than drawn", async () => {
  await expect(halfBlocks(new Uint8Array([1, 2, 3]), { width: 5 })).rejects.toThrow()
  await expect(
    halfBlocks(
      pngOf(2, 2, () => RED),
      { width: "200%" }
    )
  ).rejects.toThrow("not a valid dimension")
})
