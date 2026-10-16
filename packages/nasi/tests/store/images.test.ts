import { afterAll, expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizeImage } from "../../src/images/normalize"
import {
  IMAGE_REF_PREFIX,
  imageId,
  imageKey,
  imageRefId,
  inlineImages,
  objectSessionImages,
  storeInlineImages
} from "../../src/store/images"
import { folderObjects, memoryObjects } from "../../src/store/objects"
import { png } from "../fixtures/images"

const root = mkdtempSync(join(tmpdir(), "kaja-images-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const objects = folderObjects(root)

test("an image's id is the start of its sha256, and its ref points at it", () => {
  expect(imageId(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{16}$/)
  expect(imageRefId(`${IMAGE_REF_PREFIX}abc`)).toBe("abc")
  expect(imageRefId("data:image/png;base64,AAAA")).toBeUndefined()
})

test("a session's image is stored once, with its original beside it to open, and comes back with its type", async () => {
  const images = objectSessionImages(objects, "images/s1")
  const original = png(3000, 100)
  const image = await normalizeImage(original)
  const put = spyOn(objects, "put")
  const first = await images.put(image, original)
  const again = await images.put(image, original)
  expect(again).toEqual(first)
  expect(put).toHaveBeenCalledTimes(2)
  put.mockRestore()

  const id = imageId(image.data)
  const key = imageKey("images/s1", id)
  expect(first).toEqual({ ref: `${IMAGE_REF_PREFIX}${id}`, key, original: `${key}.orig` })
  expect(await Bun.file(join(root, `${key}.orig`)).bytes()).toEqual(new Uint8Array(original))
  expect(objects.location?.(key)).toBe(join(root, key))
  expect(await images.get(id)).toEqual({ data: new Uint8Array(image.data), mimeType: "image/png" })
  expect(await images.get("0000000000000000")).toBeUndefined()

  // An image that needed no normalising is its own original
  const small = await normalizeImage(png(2, 2))
  expect((await images.put(small, small.data)).original).toBe(imageKey("images/s1", imageId(small.data)))
})

test("a description is kept beside its image", async () => {
  const images = objectSessionImages(memoryObjects(), "images/d")
  expect(await images.description("abc")).toBeUndefined()
  await images.describe("abc", "A red square.", "vision-m")
  expect(await images.description("abc")).toBe("A red square.")
})

test("clearing a session's images leaves another session's alone", async () => {
  const image = await normalizeImage(png(2, 2))
  const [a, b] = [objectSessionImages(objects, "images/a"), objectSessionImages(objects, "images/b")]
  await a.put(image)
  await b.put(image)
  await a.clear()
  expect(await a.get(imageId(image.data))).toBeUndefined()
  expect(await b.get(imageId(image.data))).toBeDefined()
  await objects.deletePrefix("images/b/")
  expect(await b.get(imageId(image.data))).toBeUndefined()
})

test("without a store an image stays inline, and a stray inline image is stored before a save", async () => {
  const image = await normalizeImage(png(2, 2))
  expect((await inlineImages.put(image)).ref).toStartWith("data:image/png;base64,")

  const images = objectSessionImages(objects, "images/stray")
  const inline = { type: "image_url", image_url: { url: (await inlineImages.put(image)).ref } }
  const text = { type: "text", text: "hi" }
  expect(await storeInlineImages([text], images)).toEqual([text])
  expect(await storeInlineImages([text, inline], images)).toEqual([
    text,
    { type: "image_url", image_url: { url: `${IMAGE_REF_PREFIX}${imageId(image.data)}` } }
  ])
  const broken = { type: "image_url", image_url: { url: "data:image/png;base64,bm90IGFuIGltYWdl" } }
  expect(await storeInlineImages([broken], images)).toEqual([
    { type: "text", text: "[an image that couldn't be kept: not an image]" }
  ])
})
