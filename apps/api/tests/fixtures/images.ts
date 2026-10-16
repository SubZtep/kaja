import { randomBytes } from "node:crypto"
import { crc32, deflateSync } from "node:zlib"

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

/** A real RGB PNG of random pixels: it barely compresses, so its size is about `width × height × 3` bytes. */
export function noisyPng(width: number, height: number): Buffer {
  const row = width * 3 + 1
  const raw = randomBytes(row * height)
  for (let y = 0; y < height; y++) raw[y * row] = 0
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ])
}
