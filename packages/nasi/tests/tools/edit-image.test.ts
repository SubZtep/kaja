import { expect, test } from "bun:test"
import { Jimp } from "jimp"
import type { ToolContext } from "../../src/agent/agent"
import { editImageTool, parseColor } from "../../src/tools/builtin/edit-image"

const ID = "0123456789abcdef"
const LINK = `kaja-image:${ID}`

/** A 200×100 JPEG: left half black, right half white. */
async function halves(): Promise<Uint8Array> {
  const image = new Jimp({ width: 200, height: 100, color: 0x000000ff })
  for (let x = 100; x < 200; x++) for (let y = 0; y < 100; y++) image.setPixelColor(0xffffffff, x, y)
  return new Uint8Array(await image.getBuffer("image/png"))
}

async function edit(steps: unknown[], source?: Uint8Array) {
  const data = source ?? (await halves())
  const ctx = {
    images: { get: async (id: string) => (id === ID ? { data, mimeType: "image/jpeg" } : undefined) }
  } as unknown as ToolContext
  const result = await editImageTool.execute({ image: LINK, steps } as never, ctx)
  if (typeof result === "string") throw new Error(result)
  const out = result.images![0]!
  return { text: result.text, mimeType: out.mimeType, image: await Jimp.read(Buffer.from(out.data)) }
}

const brightness = (color: number) => (color >>> 24) & 0xff

test("crop keeps the region, given as fractions", async () => {
  const { image, text } = await edit([{ op: "crop", x: 0.5, y: 0, width: 0.5, height: 1 }])
  expect([image.bitmap.width, image.bitmap.height]).toEqual([100, 100])
  expect(brightness(image.getPixelColor(50, 50))).toBeGreaterThan(200)
  expect(text).toBe(`Edited ${LINK} (crop)`)
})

test("zoom enlarges the region so its longer side is 1024", async () => {
  const { image } = await edit([{ op: "zoom", x: 0, y: 0, width: 0.25, height: 0.5 }])
  expect([image.bitmap.width, image.bitmap.height]).toEqual([1024, 1024])
})

test("resize with one side keeps the aspect ratio", async () => {
  const { image } = await edit([{ op: "resize", width: 100 }])
  expect([image.bitmap.width, image.bitmap.height]).toEqual([100, 50])
})

test("steps apply in order: a quarter turn then an invert", async () => {
  const { image, mimeType } = await edit([{ op: "rotate", degrees: 90 }, { op: "invert" }])
  expect([image.bitmap.width, image.bitmap.height]).toEqual([100, 200])
  // Clockwise: the white right half is now the bottom, inverted to black
  expect(brightness(image.getPixelColor(50, 150))).toBeLessThan(50)
  expect(mimeType).toBe("image/jpeg")
})

test("an odd angle leaves transparent corners, so the result is a PNG", async () => {
  expect((await edit([{ op: "rotate", degrees: 30 }])).mimeType).toBe("image/png")
})

test("a box outlines the region in its colour, leaving the inside alone", async () => {
  const { image } = await edit([{ op: "box", x: 0.1, y: 0.1, width: 0.3, height: 0.5, color: "green" }])
  const edge = image.getPixelColor(20, 30)
  expect((edge >>> 24) & 0xff).toBeLessThan(80)
  expect((edge >>> 16) & 0xff).toBeGreaterThan(150)
  expect(brightness(image.getPixelColor(40, 30))).toBeLessThan(30)
})

test("an image that isn't in the conversation, or a path, is refused", async () => {
  const ctx = { images: { get: async () => undefined } } as unknown as ToolContext
  await expect(editImageTool.execute({ image: LINK, steps: [{ op: "invert" }] }, ctx)).rejects.toThrow("No image")
  await expect(editImageTool.execute({ image: "/tmp/a.jpg", steps: [{ op: "invert" }] }, ctx)).rejects.toThrow(
    "kaja-image:"
  )
})

test("colours by name or hex", () => {
  expect(parseColor(undefined)).toBe(0xff2d2dff)
  expect(parseColor("#00ff00")).toBe(0x00ff00ff)
  expect(() => parseColor("teal-ish")).toThrow("Unknown colour")
})
