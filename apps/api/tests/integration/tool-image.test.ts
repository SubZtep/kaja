import { afterAll, expect, spyOn, test } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deleteImages, imageHash, imageKey, saveImages, sessionImagePrefix } from "@kaja/nasi"
import { files, toolImagePrefix } from "../../src/core/files"
import { toolImageUrl } from "../../src/features/nasi/tool-image"

const userId = Bun.randomUUIDv7()
const sessionId = Bun.randomUUIDv7()
const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...crypto.getRandomValues(new Uint8Array(8))])
const hash = imageHash(bytes)
const path = join(tmpdir(), `kaja-tool-image-${userId}.png`)
await Bun.write(path, bytes)

afterAll(async () => {
  rmSync(path, { force: true })
  await deleteImages(files, toolImagePrefix(userId))
  await deleteImages(files, sessionImagePrefix(sessionId, userId))
})

test("a new session's tool image waits under tool-images, behind a signed URL", async () => {
  const url = await toolImageUrl(userId, undefined, path, "image/png")
  expect(await files.exists(imageKey(toolImagePrefix(userId), hash))).toBe(true)
  expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(bytes)
})

test("an existing session's tool image goes straight to the session, so its save doesn't upload it again", async () => {
  await toolImageUrl(userId, sessionId, path, "image/png")
  const prefix = sessionImagePrefix(sessionId, userId)
  expect(await files.exists(imageKey(prefix, hash))).toBe(true)

  const upload = spyOn(files, "upload")
  try {
    await saveImages(files, prefix, [{ hash, mimeType: "image/png", data: bytes }])
    expect(upload).not.toHaveBeenCalled()
  } finally {
    upload.mockRestore()
  }
})
