import { expect, test } from "bun:test"
import { deflateSync } from "node:zlib"
import { imageBox, maxImageColumns, maxImageRows } from "../../../components/elem/terminal-image"
import { renderTerminalImage } from "../../../lib/image/render-terminal-image"

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length)
  body.set(new TextEncoder().encode(type))
  body.set(data, 4)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(body, 4)
  view.setUint32(8 + data.length, Bun.hash.crc32(body))
  return out
}

/** A solid grey 8-bit RGB PNG. */
function png(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 2, 0, 0, 0], 8)
  const raw = new Uint8Array((1 + width * 3) * height).fill(128)
  for (let y = 0; y < height; y++) raw[y * (1 + width * 3)] = 0
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array())
  ]
  return Buffer.concat(parts)
}

test("a tall image is scaled to the requested number of rows", async () => {
  const src = `data:image/png;base64,${Buffer.from(png(20, 400)).toString("base64")}`
  const result = await renderTerminalImage(src, { height: 6 })
  expect("image" in result).toBe(true)
  if ("image" in result) expect(result.image.split("\n").filter(Boolean).length).toBeLessThanOrEqual(6)
})

test("maxImageRows leaves room for the chrome and never collapses", () => {
  expect(maxImageRows(40)).toBe(28)
  expect(maxImageRows(10)).toBe(4)
})

test("maxImageColumns follows the terminal width with a floor", () => {
  expect(maxImageColumns(100)).toBe(60)
  expect(maxImageColumns(10)).toBe(8)
})

test("a wide image is scaled to the requested number of columns", async () => {
  const src = `data:image/png;base64,${Buffer.from(png(400, 20)).toString("base64")}`
  const result = await renderTerminalImage(src, { width: 12, height: 20 })
  expect("image" in result).toBe(true)
  if ("image" in result) {
    const plain = Bun.stripANSI(result.image)
    for (const line of plain.split("\n").filter(Boolean)) expect(line.length).toBeLessThanOrEqual(12)
  }
})

test("imageBox falls back to the terminal until the container is measured", () => {
  expect(imageBox({ terminalColumns: 100, terminalRows: 40, containerWidth: 0, viewportHeight: 0 })).toEqual({
    columns: 60,
    rows: 28
  })
})

test("imageBox only ever shrinks for a narrow container or a short viewport", () => {
  expect(imageBox({ terminalColumns: 100, terminalRows: 40, containerWidth: 30, viewportHeight: 10 })).toEqual({
    columns: 30,
    rows: 8
  })
  expect(imageBox({ terminalColumns: 100, terminalRows: 40, containerWidth: 90, viewportHeight: 35 })).toEqual({
    columns: 60,
    rows: 28
  })
  expect(imageBox({ terminalColumns: 100, terminalRows: 40, containerWidth: 3, viewportHeight: 2 })).toEqual({
    columns: 8,
    rows: 4
  })
})
