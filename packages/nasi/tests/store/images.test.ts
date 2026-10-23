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
  memoryImageRows,
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

test("a session's image is stored once, its row keeping its type and size", async () => {
  const rows = memoryImageRows()
  const images = objectSessionImages(objects, "images/s1", rows)
  const image = await normalizeImage(png(3000, 100))
  const put = spyOn(objects, "put")
  const first = await images.put(image)
  const again = await images.put(image)
  expect(again).toEqual(first)
  expect(put).toHaveBeenCalledTimes(1)
  put.mockRestore()

  const id = imageId(image.data)
  const key = imageKey("images/s1", id)
  expect(first).toEqual({ ref: `${IMAGE_REF_PREFIX}${id}`, key })
  expect(objects.location?.(key)).toBe(join(root, key))
  expect(await images.get(id)).toEqual({ data: new Uint8Array(image.data), mimeType: "image/png" })
  expect(await images.get("0000000000000000")).toBeUndefined()
  expect(await rows.get(id)).toEqual({
    id,
    mimeType: "image/png",
    width: image.width,
    height: image.height,
    bytes: image.data.byteLength
  })
})

test("an image is only as stored as its row: bytes without one aren't served", async () => {
  const stray = memoryObjects()
  const image = await normalizeImage(png(2, 2))
  const id = imageId(image.data)
  await stray.put(imageKey("images/r", id), image.data, image.mimeType)
  expect(await objectSessionImages(stray, "images/r", memoryImageRows()).get(id)).toBeUndefined()
})

test("a description is kept in its image's row", async () => {
  const images = objectSessionImages(memoryObjects(), "images/d", memoryImageRows())
  const image = await normalizeImage(png(2, 2))
  const id = imageId(image.data)
  await images.put(image)
  expect(await images.description(id)).toBeUndefined()
  await images.describe(id, "A red square.", "vision-m")
  expect(await images.description(id)).toBe("A red square.")
})

test("clearing a session's images leaves another session's alone", async () => {
  const image = await normalizeImage(png(2, 2))
  const rowsOfB = memoryImageRows()
  const [a, b] = [
    objectSessionImages(objects, "images/a", memoryImageRows()),
    objectSessionImages(objects, "images/b", rowsOfB)
  ]
  await a.put(image)
  await b.put(image)
  await a.clear()
  expect(await a.get(imageId(image.data))).toBeUndefined()
  expect(await b.get(imageId(image.data))).toBeDefined()
  await objects.deletePrefix("images/b/")
  expect(await b.get(imageId(image.data))).toBeUndefined()
  expect(await rowsOfB.get(imageId(image.data))).toBeDefined()
})

test("without a store an image stays inline, and a stray inline image is stored before a save", async () => {
  const image = await normalizeImage(png(2, 2))
  expect((await inlineImages.put(image)).ref).toStartWith("data:image/png;base64,")

  const images = objectSessionImages(objects, "images/stray", memoryImageRows())
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
