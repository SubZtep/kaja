import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ToolResult } from "../../src/agent/tools"
import { createMemoryStore } from "../../src/store"
import { viewImageTool, viewLinkedImageTool } from "../../src/tools/builtin/view-image"
import { setToolDeps } from "../../src/tools/deps"
import { png } from "../fixtures/images"

let root: string
let outside: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nasi-view-root-"))
  outside = mkdtempSync(join(tmpdir(), "nasi-view-outside-"))
  setToolDeps({ workspaceRoot: root })
})

afterEach(() => {
  setToolDeps({})
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

test("an image inside the workspace is viewed without asking; one outside it asks first", () => {
  writeFileSync(join(root, "shot.png"), png(4, 4))
  writeFileSync(join(outside, "shot.png"), png(4, 4))
  expect(viewImageTool.approval?.({ path: "shot.png" })).toBeUndefined()
  expect(viewImageTool.approval?.({ path: join(outside, "shot.png") })).toBe(
    `View ${join(outside, "shot.png")} (outside the folder Kaja runs in)`
  )
  // Arguments the model got wrong are left to the schema check
  expect(viewImageTool.approval?.({ path: 3 } as never)).toBeUndefined()
})

test("secrets.toml and the conversation store are never viewed, not even after an approval", async () => {
  const store = join(outside, "memory.sqlite")
  setToolDeps({ workspaceRoot: root, storePath: store })
  writeFileSync(join(outside, "secrets.toml"), "")
  writeFileSync(store, "")
  for (const path of [join(outside, "secrets.toml"), store]) {
    expect(viewImageTool.approval?.({ path })).toBeUndefined()
    await expect(viewImageTool.execute({ path })).rejects.toThrow("Path is not readable")
  }
})

test("a file that isn't an image is refused; a big one comes back model-sized", async () => {
  writeFileSync(join(root, "notes.png"), "just text")
  await expect(viewImageTool.execute({ path: "notes.png" })).rejects.toThrow("notes.png: not an image")

  writeFileSync(join(root, "photo.png"), png(3000, 1500))
  const result = (await viewImageTool.execute({ path: "photo.png" })) as ToolResult
  expect(result.text).toBe("Viewing image: photo.png")
  const image = result.images![0]!
  expect(image.mimeType).toBe("image/png")
  expect((await new Bun.Image(image.data).metadata()).width).toBe(1568)
})

test("an image of the conversation is viewed again by its link, without asking; the cloud's view_image takes only links", async () => {
  const images = createMemoryStore().images(Bun.randomUUIDv7())
  const data = png(2, 2)
  const { ref } = await images.put({ data, mimeType: "image/png" })
  expect(viewImageTool.approval?.({ path: ref })).toBeUndefined()
  const viewed = (await viewImageTool.execute({ path: ref }, { owner: null, images })) as ToolResult
  expect(viewed.images![0]!.data).toEqual(new Uint8Array(data))
  await expect(viewImageTool.execute({ path: `${ref.slice(0, -1)}0` }, { owner: null, images })).rejects.toThrow(
    "No image"
  )
  expect(((await viewLinkedImageTool.execute({ path: ref }, { owner: null, images })) as ToolResult).text).toBe(
    `Viewing image: ${ref}`
  )
  await expect(viewLinkedImageTool.execute({ path: "/etc/hostname" }, { owner: null, images })).rejects.toThrow(
    "Only an image's kaja-image: link"
  )
})
