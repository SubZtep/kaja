import { expect, spyOn, test } from "bun:test"
import { ImageError, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, normalizeImage } from "../../src/images/normalize"
import { jpeg, png } from "../fixtures/images"

const formatOf = async (data: Uint8Array) => (await new Bun.Image(data).metadata()).format

test("a big photo becomes a JPEG that fits the edge", async () => {
  const out = await normalizeImage(await jpeg(3000, 2000, { noise: true }))
  expect(out.mimeType).toBe("image/jpeg")
  expect(await formatOf(out.data)).toBe("jpeg")
  expect([out.width, out.height]).toEqual([MAX_IMAGE_EDGE, 1045])
  expect(out.data.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES)
})

test("a PNG stays a PNG, with or without transparency", async () => {
  for (const source of [png(2000, 1000), png(2000, 1000, { alpha: 0 })]) {
    const out = await normalizeImage(source)
    expect(out.mimeType).toBe("image/png")
    expect(await formatOf(out.data)).toBe("png")
    expect(out.width).toBe(MAX_IMAGE_EDGE)
  }
})

test("a transparent WebP becomes a PNG, an opaque one a JPEG", async () => {
  const clear = await new Bun.Image(png(40, 40, { alpha: 0 })).webp({ lossless: true }).bytes()
  const opaque = await new Bun.Image(png(40, 40)).webp().bytes()
  expect((await normalizeImage(clear)).mimeType).toBe("image/png")
  expect((await normalizeImage(opaque)).mimeType).toBe("image/jpeg")
})

test("a small image is never enlarged, and an already normalised one comes back unchanged", async () => {
  const small = await jpeg(64, 32)
  const out = await normalizeImage(small)
  expect(out.data).toBe(small)
  expect([out.width, out.height]).toEqual([64, 32])
  const again = await normalizeImage((await normalizeImage(png(3000, 100))).data)
  expect(again.width).toBe(MAX_IMAGE_EDGE)
})

test("bytes that aren't an image are refused with a reason", async () => {
  const refused = (await normalizeImage(new TextEncoder().encode("just some text")).catch(
    error => error as unknown
  )) as ImageError
  expect(refused).toBeInstanceOf(ImageError)
  expect(refused.code).toBe("not-an-image")
  expect(refused.message).toBe("not an image")
})

test("a decoder failure it has no words for is still an ImageError, so the turn goes on", async () => {
  const image = spyOn(Bun, "Image").mockImplementation((() => {
    throw Object.assign(new Error("Image: something new"), { code: "ERR_IMAGE_SOMETHING_NEW" })
  }) as never)
  try {
    const refused = (await normalizeImage(png(4, 4)).catch(error => error as unknown)) as ImageError
    expect(refused).toBeInstanceOf(ImageError)
    expect(refused.code).toBe("undecodable")
  } finally {
    image.mockRestore()
  }
})
