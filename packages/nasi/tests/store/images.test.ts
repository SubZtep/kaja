import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Files } from "files-sdk"
import { fs } from "files-sdk/fs"
import { deleteImages, imageKey, loadImages, saveImages } from "../../src/store/images"
import { detachImages, IMAGE_REF_PREFIX, imageHash, imageRefs } from "../../src/store/rows"

const root = mkdtempSync(join(tmpdir(), "kaja-images-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const files = new Files({ adapter: fs({ root }) })

const png = { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }

test("imageHash is the sha256 detachImages keys an image by", () => {
  const { images } = detachImages([png])
  expect(images[0]!.hash).toBe(imageHash(images[0]!.data))
  expect(imageHash(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{64}$/)
})

test("imageRefs lists the hashes the parts refer to", () => {
  expect(imageRefs(null)).toEqual([])
  expect(imageRefs([{ type: "text", text: "hi" }, png])).toEqual([])
  expect(imageRefs(detachImages([png]).parts)).toEqual([detachImages([png]).images[0]!.hash])
})

test("images saved under a prefix load back by reference and leave with deleteImages", async () => {
  const { parts, images } = detachImages([png])
  await saveImages(files, "images/s1", images)
  await saveImages(files, "images/s2", images)

  const loaded = await loadImages(files, "images/s1", [parts, null])
  expect(loaded.get(images[0]!.hash)).toEqual({ mimeType: "image/png", data: new Uint8Array(images[0]!.data) })

  await deleteImages(files, "images/s1")
  expect(await files.exists(imageKey("images/s1", images[0]!.hash))).toBe(false)
  expect(await files.exists(imageKey("images/s2", images[0]!.hash))).toBe(true)
  expect((await loadImages(files, "images/s1", [parts])).size).toBe(0)
})

test("a reference to a missing image is left out", async () => {
  const loaded = await loadImages(files, "images/none", [
    [{ type: "image_url", image_url: { url: `${IMAGE_REF_PREFIX}abc` } }]
  ])
  expect(loaded.size).toBe(0)
})
