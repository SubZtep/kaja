import { expect, test } from "bun:test"
import { inflateSync } from "node:zlib"
import type { ToolContext } from "../../src/agent/agent"
import { editImageTool } from "../../src/tools/builtin/edit-image"
import { bitmap } from "../fixtures/images"

const ID = "0123456789abcdef"
const LINK = `kaja-image:${ID}`
const BLACK: [number, number, number] = [0, 0, 0]
const WHITE: [number, number, number] = [255, 255, 255]

/** 2×1: black left, white right. */
const sideBySide = () => bitmap(2, 1, x => (x === 0 ? BLACK : WHITE))
/** 1×2: black top, white bottom. */
const stacked = () => bitmap(1, 2, (_, y) => (y === 0 ? BLACK : WHITE))
/** 200×100, all black. */
const wide = () => bitmap(200, 100, () => BLACK)

/** An image's pixels as RGB rows, read back from a PNG re-encode (Bun.Image can't hand out raw pixels). */
async function pixels(data: Uint8Array): Promise<number[][][]> {
  const file = Buffer.from(await new Bun.Image(data).png().bytes())
  const width = file.readUInt32BE(16)
  const height = file.readUInt32BE(20)
  const bpp = file[25] === 6 ? 4 : 3
  const idat: Buffer[] = []
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at)
    if (file.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(file.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? out[y * stride + i - bpp]! : 0
      const up = y > 0 ? out[(y - 1) * stride + i]! : 0
      const upLeft = y > 0 && i >= bpp ? out[(y - 1) * stride + i - bpp]! : 0
      const p = left + up - upLeft
      const paeth = [left, up, upLeft].sort((a, b) => Math.abs(p - a) - Math.abs(p - b))[0]!
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter!]!
      out[y * stride + i] = (raw[y * (stride + 1) + 1 + i]! + predictor) & 0xff
    }
  }
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => [...out.subarray(y * stride + x * bpp, y * stride + x * bpp + 3)])
  )
}

async function edit(steps: unknown[], source = sideBySide(), mimeType = "image/png") {
  const ctx = {
    images: { get: async (id: string) => (id === ID ? { data: source, mimeType } : undefined) }
  } as unknown as ToolContext
  const result = await editImageTool.execute({ image: LINK, steps } as never, ctx)
  if (typeof result === "string") throw new Error(result)
  const out = result.images![0]!
  return { text: result.text, mimeType: out.mimeType, data: out.data, size: await new Bun.Image(out.data).metadata() }
}

test("resize with one side keeps the aspect ratio", async () => {
  const { size, text } = await edit([{ op: "resize", width: 100 }], wide())
  expect([size.width, size.height]).toEqual([100, 50])
  expect(text).toBe(`Edited ${LINK} (resize)`)
})

test("resize with both sides sets them", async () => {
  const { size } = await edit([{ op: "resize", width: 30, height: 70 }], wide())
  expect([size.width, size.height]).toEqual([30, 70])
})

test("steps apply in the order given", async () => {
  const turnThenResize = await edit(
    [
      { op: "rotate", degrees: 90 },
      { op: "resize", width: 100 }
    ],
    wide()
  )
  expect([turnThenResize.size.width, turnThenResize.size.height]).toEqual([100, 200])
  const resizeThenTurn = await edit(
    [
      { op: "resize", width: 100 },
      { op: "rotate", degrees: 90 }
    ],
    wide()
  )
  expect([resizeThenTurn.size.width, resizeThenTurn.size.height]).toEqual([50, 100])
})

/** The edit's pixel at (x, y) as RGB. */
async function pixelAfter(steps: unknown[], source: Uint8Array, x = 0, y = 0): Promise<number[]> {
  return (await pixels((await edit(steps, source)).data))[y]![x]!
}

test("rotate turns clockwise", async () => {
  // Clockwise, the left side ends up on top
  const turned = [{ op: "rotate", degrees: 90 }]
  expect(await pixelAfter(turned, sideBySide(), 0, 0)).toEqual(BLACK)
  expect(await pixelAfter(turned, sideBySide(), 0, 1)).toEqual(WHITE)
})

test("rotate takes only multiples of 90", async () => {
  await expect(edit([{ op: "rotate", degrees: 30 }])).rejects.toThrow("multiple of 90")
})

test("flip mirrors across either axis", async () => {
  const horizontal = [{ op: "flip", direction: "horizontal" }]
  expect(await pixelAfter(horizontal, sideBySide(), 0, 0)).toEqual(WHITE)
  expect(await pixelAfter(horizontal, sideBySide(), 1, 0)).toEqual(BLACK)
  const vertical = [{ op: "flip", direction: "vertical" }]
  expect(await pixelAfter(vertical, stacked(), 0, 0)).toEqual(WHITE)
  expect(await pixelAfter(vertical, stacked(), 0, 1)).toEqual(BLACK)
})

test("brightness -1 goes black, and +1 doubles", async () => {
  expect(
    await pixelAfter(
      [{ op: "brightness", amount: -1 }],
      bitmap(1, 1, () => [200, 100, 50])
    )
  ).toEqual(BLACK)
  const [r] = await pixelAfter(
    [{ op: "brightness", amount: 1 }],
    bitmap(1, 1, () => [100, 50, 20])
  )
  expect(r).toBeGreaterThan(150)
})

test("greyscale equalises the channels", async () => {
  const [r, g, b] = await pixelAfter(
    [{ op: "greyscale" }],
    bitmap(1, 1, () => [200, 60, 30])
  )
  expect(Math.abs(r! - g!)).toBeLessThan(4)
  expect(Math.abs(g! - b!)).toBeLessThan(4)
})

test("a PNG stays a PNG and anything else comes back as a JPEG", async () => {
  const fromPng = await edit([{ op: "greyscale" }])
  expect([fromPng.mimeType, fromPng.size.format]).toEqual(["image/png", "png"])
  const jpeg = await new Bun.Image(wide()).jpeg().bytes()
  const fromJpeg = await edit([{ op: "greyscale" }], jpeg, "image/jpeg")
  expect([fromJpeg.mimeType, fromJpeg.size.format]).toEqual(["image/jpeg", "jpeg"])
})

test("an image that isn't in the conversation, or a path, is refused", async () => {
  const ctx = { images: { get: async () => undefined } } as unknown as ToolContext
  await expect(editImageTool.execute({ image: LINK, steps: [{ op: "greyscale" }] }, ctx)).rejects.toThrow("No image")
  await expect(editImageTool.execute({ image: "/tmp/a.jpg", steps: [{ op: "greyscale" }] }, ctx)).rejects.toThrow(
    "kaja-image:"
  )
})

test("its JSON schema has no boolean `items`, which llama.cpp refuses", () => {
  expect(
    JSON.stringify((editImageTool.definition as { function: { parameters: unknown } }).function.parameters)
  ).not.toMatch(/"items":(false|true)|prefixItems/)
})
