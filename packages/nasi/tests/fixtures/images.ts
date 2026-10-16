import { crc32, deflateSync } from "node:zlib"

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

/** A real PNG of one colour (RGB, or RGBA with `alpha`), built in memory; `noise` makes it compress badly. */
export function png(width: number, height: number, opts: { alpha?: number; noise?: boolean } = {}): Uint8Array {
  const channels = opts.alpha === undefined ? 3 : 4
  const row = width * channels + 1
  const raw = Buffer.alloc(row * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * row + 1 + x * channels
      const shade = opts.noise ? (x * 7919 + y * 104_729) % 251 : 200
      raw[at] = shade
      raw[at + 1] = opts.noise ? (shade * 3) % 256 : 60
      raw[at + 2] = opts.noise ? (shade * 5) % 256 : 30
      if (opts.alpha !== undefined) raw[at + 3] = opts.alpha
    }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = opts.alpha === undefined ? 2 : 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ])
}

/** A real JPEG, encoded from {@link png}. */
export const jpeg = (width: number, height: number, opts: { noise?: boolean } = {}) =>
  new Bun.Image(png(width, height, opts)).jpeg({ quality: 90 }).bytes()

/** A 1×1 PNG's base64, for results that only need a real image. */
export const TINY_PNG_BASE64 = Buffer.from(png(1, 1)).toString("base64")
