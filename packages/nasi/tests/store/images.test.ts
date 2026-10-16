import { afterAll, expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Files } from "files-sdk"
import { fs } from "files-sdk/fs"
import { normalizeImage } from "../../src/images/normalize"
import {
  deleteImages,
  filesSessionImages,
  IMAGE_REF_PREFIX,
  imageId,
  imageKey,
  imageRefId,
  inlineImages,
  storeInlineImages
} from "../../src/store/images"
import { png } from "../fixtures/images"

const root = mkdtempSync(join(tmpdir(), "kaja-images-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const files = new Files({ adapter: fs({ root }) })

test("an image's id is the start of its sha256, and its ref points at it", () => {
  expect(imageId(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{16}$/)
  expect(imageRefId(`${IMAGE_REF_PREFIX}abc`)).toBe("abc")
  expect(imageRefId("data:image/png;base64,AAAA")).toBeUndefined()
})

test("a session's image is stored once, with its original beside it, and comes back with its type", async () => {
  const images = filesSessionImages(files, "images/s1")
  const original = png(3000, 100)
  const image = await normalizeImage(original)
  const upload = spyOn(files, "upload")
  const first = await images.put(image, original)
  const again = await images.put(image, original)
  expect(again).toEqual(first)
  expect(upload).toHaveBeenCalledTimes(2)
  upload.mockRestore()

  const id = imageId(image.data)
  expect(first).toEqual({ ref: `${IMAGE_REF_PREFIX}${id}`, key: imageKey("images/s1", id) })
  expect(await files.exists(`${imageKey("images/s1", id)}.orig`)).toBe(true)
  expect(await images.get(id)).toEqual({ data: new Uint8Array(image.data), mimeType: "image/png" })
  expect(await images.get("0000000000000000")).toBeUndefined()
})

test("clearing a session's images leaves another session's alone", async () => {
  const image = await normalizeImage(png(2, 2))
  const [a, b] = [filesSessionImages(files, "images/a"), filesSessionImages(files, "images/b")]
  await a.put(image)
  await b.put(image)
  await a.clear()
  expect(await a.get(imageId(image.data))).toBeUndefined()
  expect(await b.get(imageId(image.data))).toBeDefined()
  await deleteImages(files, "images/b")
  expect(await b.get(imageId(image.data))).toBeUndefined()
})

test("without a store an image stays inline, and a stray inline image is stored before a save", async () => {
  const image = await normalizeImage(png(2, 2))
  expect((await inlineImages.put(image)).ref).toStartWith("data:image/png;base64,")

  const images = filesSessionImages(files, "images/stray")
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
