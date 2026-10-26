import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, utimesSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizeImage } from "@kaja/nasi"
import {
  describeLocalImage,
  findOrphans,
  imagesToDescribe,
  localImageStats,
  removeOrphans
} from "../../../src/lib/store/image-maintenance"
import { createSqliteStore, imagesRoot, openLocalDb } from "../../../src/lib/store/sqlite"
import { png } from "../../fixtures/images"

const dir = mkdtempSync(join(tmpdir(), "kaja-image-maintenance-"))
const dbPath = join(dir, "memory.sqlite")
const store = await createSqliteStore(dbPath)
const db = await openLocalDb(dbPath)
afterAll(async () => {
  await db.close()
  rmSync(dir, { recursive: true, force: true })
})
const filesRoot = imagesRoot(dbPath)
const LONG_AGO = "2000-01-01T00:00:00.000Z"

/** A vision model answering `text` (or throwing it). */
const describer = (text: string | Error = "A small square.") => ({
  model: "vision-m",
  client: {
    chat: {
      completions: {
        create: async () => {
          if (text instanceof Error) throw text
          return { model: "vision-m", choices: [{ message: { content: text } }], usage: { prompt_tokens: 4 } }
        }
      }
    }
  } as never
})

/** A saved session with one stored image, its message labelled as a turn would have it. */
async function savedImage(source?: { url?: string; fileName?: string }, size = 2) {
  const sessionId = Bun.randomUUIDv7()
  const image = await normalizeImage(await png(size, size))
  const { ref } = await store.images(sessionId).put(image, source)
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: `[Image ${ref} (${size}×${size}): an image the user sent]` },
        { type: "image_url", image_url: { url: ref } }
      ]
    }
  ]
  await store.createSession({
    persona: "default",
    model: "m",
    owner: null,
    title: `t-${sessionId.slice(-4)}`,
    session: { id: sessionId, messages },
    events: []
  })
  return {
    sessionId,
    id: ref.slice("kaja-image:".length),
    ref,
    bytes: image.data.byteLength,
    width: image.width,
    height: image.height
  }
}

const rowOf = async (sessionId: string, id: string) =>
  (
    await db<{ description: string | null; describe_attempts: number }[]>`
      SELECT description, describe_attempts FROM nasi_image WHERE session_id = ${sessionId} AND id = ${id}`
  )[0] ?? null

test("the numbers count the store's images, their sites and the sessions holding the most", async () => {
  const a = await savedImage({ url: "https://www.Example.com/a.png" }, 4)
  await savedImage({ url: "https://example.com/b.png" })
  await savedImage({ fileName: "shot.png" })
  const stats = await localImageStats(db)
  expect(stats.count).toBe(3)
  expect(stats.undescribed).toBe(3)
  expect(stats.sites).toEqual([{ host: "example.com", images: 2 }])
  expect(stats.sessions[0]).toMatchObject({ id: a.sessionId, images: 1, bytes: a.bytes })
})

test("describing keeps the description in the row, the message's label and the model calls; tries are counted", async () => {
  const image = await savedImage()
  const local = (await imagesToDescribe(db, false)).find(each => each.sessionId === image.sessionId)!
  expect(await describeLocalImage(db, filesRoot, describer(), local)).toBe("A small square.")
  expect(await rowOf(image.sessionId, image.id)).toEqual({ description: "A small square.", describe_attempts: 1 })
  const [{ parts }] = await db`SELECT parts FROM nasi_message WHERE session_id = ${image.sessionId}`
  expect(JSON.parse(parts)[0]).toEqual({ type: "text", text: `[Image ${image.ref} (2×2): A small square.]` })
  expect([...(await db`SELECT kind, model FROM nasi_model_call WHERE session_id = ${image.sessionId}`)]).toEqual([
    { kind: "describe", model: "vision-m" }
  ])

  const stubborn = await savedImage()
  const target = (await imagesToDescribe(db, false)).find(each => each.sessionId === stubborn.sessionId)!
  for (let i = 0; i < 3; i++)
    await expect(describeLocalImage(db, filesRoot, describer(new Error("down")), target)).rejects.toThrow("down")
  expect((await rowOf(stubborn.sessionId, stubborn.id))?.describe_attempts).toBe(3)
  expect((await imagesToDescribe(db, false)).some(each => each.sessionId === stubborn.sessionId)).toBe(false)
  expect((await imagesToDescribe(db, true)).some(each => each.sessionId === stubborn.sessionId)).toBe(true)
  // An empty answer is a try too
  expect(await describeLocalImage(db, filesRoot, describer(""), target)).toBeUndefined()
  expect((await rowOf(stubborn.sessionId, stubborn.id))?.describe_attempts).toBe(4)
})

test("orphans of each kind are found, and removed once they're old enough", async () => {
  // A file with no row
  const strayDir = join(filesRoot, "images", Bun.randomUUIDv7())
  await mkdir(strayDir, { recursive: true })
  const stray = join(strayDir, "0123456789abcdef")
  await Bun.write(stray, await png(2, 2))
  await Bun.write(join(strayDir, "0123456789abcdef.json"), "{}")
  // A row whose file is gone
  const lost = await savedImage()
  rmSync(join(filesRoot, "images", lost.sessionId, lost.id))
  // A session never saved, a day and more ago
  const unsavedId = Bun.randomUUIDv7()
  const { ref } = await store.images(unsavedId).put(await normalizeImage(await png(3, 3)))
  await db`UPDATE nasi_image SET created_at = ${LONG_AGO} WHERE session_id = ${unsavedId}`

  const found = await findOrphans(db, filesRoot)
  expect(found.files.examples).toEqual([stray])
  expect(found.rows.examples).toContain(join(filesRoot, "images", lost.sessionId, lost.id))
  expect(found.unsaved.examples).toEqual([join(filesRoot, "images", unsavedId, ref.slice("kaja-image:".length))])

  // Written just now, so an hour's grace keeps the stray file; old enough, it goes
  expect(await removeOrphans(db, "files", found)).toBe(0)
  expect(await Bun.file(stray).exists()).toBe(true)
  const old = new Date(LONG_AGO)
  utimesSync(stray, old, old)
  expect(await removeOrphans(db, "files", await findOrphans(db, filesRoot))).toBe(1)
  expect(await Bun.file(stray).exists()).toBe(false)
  expect(await Bun.file(join(strayDir, "0123456789abcdef.json")).exists()).toBe(true)

  await db`UPDATE nasi_image SET created_at = ${LONG_AGO} WHERE session_id = ${lost.sessionId}`
  expect(await removeOrphans(db, "rows", await findOrphans(db, filesRoot))).toBe(1)
  expect(await rowOf(lost.sessionId, lost.id)).toBeNull()
  expect(await removeOrphans(db, "unsaved", await findOrphans(db, filesRoot))).toBe(1)
  expect(await rowOf(unsavedId, ref.slice("kaja-image:".length))).toBeNull()
})
