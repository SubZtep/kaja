import { inflateSync } from "node:zlib"
import chalk from "chalk"

/** The lower half block: its foreground paints the bottom pixel, its background the top one. */
const PIXEL = "▄"
/** Ink's output is followed by a newline, so frames are two pixel rows shorter than the terminal. */
const ROW_OFFSET = 2
const PNG_SIGNATURE_LENGTH = 8
const RGBA_CHANNELS = 4

type Dimension = string | number

/** A size as cells: a number as it is, "60%" as that share of `base`. */
function cells(value: Dimension | undefined, base: number): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === "number") return value
  const percent = value.endsWith("%") ? Number(value.slice(0, -1)) : Number.NaN
  if (!(percent > 0 && percent <= 100)) throw new Error(`${value} is not a valid dimension value`)
  return Math.floor((percent / 100) * base)
}

/** The size in pixels (two to a cell vertically) that fits `image` into the box, keeping its aspect ratio. */
function pixelSize(
  image: { width: number; height: number },
  width: Dimension | undefined,
  height: Dimension | undefined
) {
  const columns = process.stdout.columns || 80
  const rows = Math.max(1, (process.stdout.rows || 24) - ROW_OFFSET)
  const maxWidth = cells(width, columns) ?? columns
  const maxHeight = (cells(height, rows) ?? rows) * 2
  const factor = Math.min(maxWidth / image.width, maxHeight / image.height, columns / image.width)
  return {
    width: Math.max(1, Math.round(image.width * factor)),
    height: Math.max(1, Math.round(image.height * factor))
  }
}

/** The IDAT chunks of a PNG, concatenated. */
function collectIdat(view: Buffer): Buffer {
  const idat: Buffer[] = []
  for (let at = PNG_SIGNATURE_LENGTH; at < view.length; ) {
    const length = view.readUInt32BE(at)
    if (view.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(view.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  return Buffer.concat(idat)
}

/** One unfiltered byte of a PNG scanline, given its already-unfiltered neighbours. */
function unfilterByte(pixels: Uint8Array, raw: Buffer, y: number, i: number, stride: number, filter: number): number {
  const left = i >= RGBA_CHANNELS ? pixels[y * stride + i - RGBA_CHANNELS]! : 0
  const up = y > 0 ? pixels[(y - 1) * stride + i]! : 0
  const upLeft = y > 0 && i >= RGBA_CHANNELS ? pixels[(y - 1) * stride + i - RGBA_CHANNELS]! : 0
  const guess = left + up - upLeft
  const paeth = [left, up, upLeft].sort((a, b) => Math.abs(guess - a) - Math.abs(guess - b))[0]!
  const predictor = [0, left, up, (left + up) >> 1, paeth][filter]!
  return (raw[y * (stride + 1) + 1 + i]! + predictor) & 0xff
}

/** Reverses PNG's per-scanline filtering (types 0-4) over raw inflated bytes. */
function unfilterPixels(raw: Buffer, width: number, height: number): Uint8Array {
  const stride = width * RGBA_CHANNELS
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    for (let i = 0; i < stride; i++) pixels[y * stride + i] = unfilterByte(pixels, raw, y, i, stride, filter)
  }
  return pixels
}

/** Reads the pixels of an 8-bit RGBA PNG, the only kind Bun.Image writes. */
function decodeRgba(file: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const view = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
  const width = view.readUInt32BE(16)
  const height = view.readUInt32BE(20)
  if (view[24] !== 8 || view[25] !== 6 || view[28] !== 0) throw new Error("Unexpected PNG encoding")
  const raw = inflateSync(collectIdat(view))
  return { width, height, pixels: unfilterPixels(raw, width, height) }
}

/**
 * Draws an image as ANSI half-block text, fitted into `width`×`height` (cells, or a "%" of the terminal) with its
 * aspect ratio kept. A fully transparent upper pixel leaves its cell's background alone.
 */
export async function halfBlocks(data: Uint8Array, box: { width?: Dimension; height?: Dimension }): Promise<string> {
  const source = await new Bun.Image(data).metadata()
  const size = pixelSize(source, box.width, box.height)
  const { width, height, pixels } = decodeRgba(await new Bun.Image(data).resize(size.width, size.height).png().bytes())
  const lines: string[] = []
  for (let y = 0; y < height - 1; y += 2) {
    let line = ""
    for (let x = 0; x < width; x++) {
      const top = (y * width + x) * RGBA_CHANNELS
      const bottom = ((y + 1) * width + x) * RGBA_CHANNELS
      const [r2, g2, b2] = [pixels[bottom]!, pixels[bottom + 1]!, pixels[bottom + 2]!]
      line +=
        pixels[top + 3] === 0
          ? chalk.reset.rgb(r2, g2, b2)(PIXEL)
          : chalk.bgRgb(pixels[top]!, pixels[top + 1]!, pixels[top + 2]!).rgb(r2, g2, b2)(PIXEL)
    }
    lines.push(line)
  }
  return lines.join("\n")
}
