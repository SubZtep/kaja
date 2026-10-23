import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { faker } from "@faker-js/faker"
import type { ImageOrphansResponse } from "@kaja/schema/api"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { objects } from "../../src/core/files"
import { setNasiDescriberResolver } from "../../src/features/nasi/chat"
import { nasiStore } from "../../src/features/nasi/store"
import { ImageService } from "../../src/services/image"
import { noisyPng } from "../fixtures/images"
import { signUpAndSignIn } from "./helpers"

async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, name)
  const userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id as string
  return { token, userId }
}

/** A vision model that answers `text` (or throws it), counting its calls. */
function visionModel(text: string | Error = "A small noisy square.") {
  const calls: unknown[] = []
  const describer = {
    model: "vision-m",
    client: {
      chat: {
        completions: {
          create: async (params: unknown) => {
            calls.push(params)
            if (text instanceof Error) throw text
            return {
              model: "vision-m",
              choices: [{ message: { content: text } }],
              usage: { prompt_tokens: 7, completion_tokens: 3 }
            }
          }
        }
      }
    } as never
  }
  return { calls, describer }
}

const LONG_AGO = new Date("2000-01-01T00:00:00Z")
const image = () => ({ data: noisyPng(2, 2), mimeType: "image/png", width: 2, height: 2 })
const idOf = (ref: string) => ref.slice("kaja-image:".length)

async function row(sessionId: string, id: string) {
  const { rows } = await pool.query(
    "SELECT description, description_model, describe_attempts FROM nasi_image WHERE session_id = $1 AND id = $2",
    [sessionId, id]
  )
  return rows[0] as
    { description: string | null; description_model: string | null; describe_attempts: number } | undefined
}

describe("image maintenance", () => {
  let owner: Awaited<ReturnType<typeof signUp>>
  let admin: Awaited<ReturnType<typeof signUp>>
  const service = new ImageService(pool)

  beforeAll(async () => {
    owner = await signUp("Owner")
    admin = await signUp("Admin")
    await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin.userId])
  })

  afterEach(() => setNasiDescriberResolver(undefined))

  afterAll(async () => {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[owner.userId, admin.userId]])
  })

  /** A saved session holding one stored image, its message labelled as a turn would have it. */
  async function sessionWithImage() {
    const store = nasiStore(owner.userId)
    const sessionId = Bun.randomUUIDv7()
    const { ref } = await store.images(sessionId).put(image())
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: `[Image ${ref} (2×2): an image the user sent]` },
          { type: "image_url", image_url: { url: ref } }
        ]
      }
    ]
    await store.createSession({
      persona: "default",
      model: "m",
      owner: null,
      title: "t",
      session: { id: sessionId, messages },
      events: []
    })
    return { sessionId, id: idOf(ref), ref }
  }

  test("the sweep describes old undescribed images, keeping the description in the row, the labels and the stats", async () => {
    const old = await sessionWithImage()
    const fresh = await sessionWithImage()
    const givenUp = await sessionWithImage()
    await pool.query("UPDATE nasi_image SET created_at = $2 WHERE session_id = ANY($1)", [
      [old.sessionId, givenUp.sessionId],
      LONG_AGO
    ])
    await pool.query("UPDATE nasi_image SET describe_attempts = 3 WHERE session_id = $1", [givenUp.sessionId])

    const { calls, describer } = visionModel()
    await service.sweep(describer)
    expect(await row(old.sessionId, old.id)).toEqual({
      description: "A small noisy square.",
      description_model: "vision-m",
      describe_attempts: 1
    })
    expect(await row(fresh.sessionId, fresh.id)).toMatchObject({ description: null, describe_attempts: 0 })
    expect(await row(givenUp.sessionId, givenUp.id)).toMatchObject({ description: null, describe_attempts: 3 })
    expect(calls.length).toBeGreaterThanOrEqual(1)

    const { rows: parts } = await pool.query("SELECT parts FROM nasi_message WHERE session_id = $1", [old.sessionId])
    expect(parts[0].parts[0]).toEqual({ type: "text", text: `[Image ${old.ref} (2×2): A small noisy square.]` })
    const { rows: modelCalls } = await pool.query(
      "SELECT kind, model, prompt_tokens, completion_tokens FROM nasi_model_call WHERE session_id = $1",
      [old.sessionId]
    )
    expect(modelCalls).toEqual([{ kind: "describe", model: "vision-m", prompt_tokens: 7, completion_tokens: 3 }])
  })

  test("a model that keeps failing is tried three times by the sweep, then left alone", async () => {
    const broken = await sessionWithImage()
    await pool.query("UPDATE nasi_image SET created_at = $2 WHERE session_id = $1", [broken.sessionId, LONG_AGO])
    const { describer } = visionModel(new Error("model down"))
    const warned = spyOn(console, "warn").mockImplementation(() => {})
    try {
      for (let i = 0; i < 4; i++) await service.sweep(describer)
    } finally {
      warned.mockRestore()
    }
    expect(await row(broken.sessionId, broken.id)).toMatchObject({ description: null, describe_attempts: 3 })
    // An empty answer is a try too
    const empty = await sessionWithImage()
    await service.describe(empty.sessionId, empty.id, visionModel("").describer)
    expect(await row(empty.sessionId, empty.id)).toMatchObject({ description: null, describe_attempts: 1 })
  })

  test("an admin describes one image now, or every matching one in the background", async () => {
    const one = await sessionWithImage()
    const path = `/admin/images/${one.sessionId}/${one.id}/describe`
    const post = (to: string, token: string, body?: unknown) =>
      app.request(to, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    expect((await post(path, owner.token)).status).toBe(403)

    setNasiDescriberResolver(async () => undefined)
    expect((await post(path, admin.token)).status).toBe(409)

    const { describer } = visionModel("Described on request.")
    setNasiDescriberResolver(async () => describer)
    await pool.query("UPDATE nasi_image SET describe_attempts = 3 WHERE session_id = $1", [one.sessionId])
    const res = await post(path, admin.token)
    expect(await res.json()).toEqual({ description: "Described on request." })
    expect((await post(`/admin/images/${one.sessionId}/0000000000000000/describe`, admin.token)).status).toBe(404)

    const many = [await sessionWithImage(), await sessionWithImage()]
    const queued = await post("/admin/images/describe", admin.token, { user: owner.userId })
    expect(((await queued.json()) as { queued: number }).queued).toBeGreaterThanOrEqual(2)
    // Several at a time, finishing in any order: wait for every one of them
    const described = async () =>
      (await Promise.all(many.map(each => row(each.sessionId, each.id)))).every(each => each?.description)
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && !(await described())) await Bun.sleep(50)
    for (const each of many) expect((await row(each.sessionId, each.id))?.description).toBe("Described on request.")
  }, 20_000)

  test("orphans of each kind are found, and removed only once they're old enough", async () => {
    // An object with no row
    const strayKey = `images/${owner.userId}/${Bun.randomUUIDv7()}/${faker.string.hexadecimal({ length: 16, prefix: "" }).toLowerCase()}`
    await objects.put(strayKey, noisyPng(2, 2), "image/png")
    // A row whose object is gone
    const lost = await sessionWithImage()
    await objects.delete(`images/${owner.userId}/${lost.sessionId}/${lost.id}`)
    // A session that never got saved, a day and more ago
    const unsaved = Bun.randomUUIDv7()
    const { ref } = await nasiStore(owner.userId).images(unsaved).put(image())
    await pool.query("UPDATE nasi_image SET created_at = $2 WHERE session_id = $1", [unsaved, LONG_AGO])

    expect(
      (await app.request("/admin/images/orphans", { headers: { Authorization: `Bearer ${owner.token}` } })).status
    ).toBe(403)
    const res = await app.request("/admin/images/orphans", { headers: { Authorization: `Bearer ${admin.token}` } })
    const found = (await res.json()) as ImageOrphansResponse
    expect(found.objects.examples).toContain(strayKey)
    expect(found.rows.examples).toContain(`images/${owner.userId}/${lost.sessionId}/${lost.id}`)
    expect(found.unsaved.examples).toContain(`images/${owner.userId}/${unsaved}/${idOf(ref)}`)

    // Just written, so the route's hour of grace keeps the stray object
    const kept = await app.request("/admin/images/orphans/objects", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${admin.token}` }
    })
    expect(kept.status).toBe(200)
    expect(await objects.exists(strayKey)).toBe(true)

    const now = new ImageService(pool, { orphanGraceMs: 0 })
    expect(await now.removeOrphans("objects")).toBeGreaterThanOrEqual(1)
    expect(await objects.exists(strayKey)).toBe(false)
    expect(await now.removeOrphans("rows")).toBeGreaterThanOrEqual(1)
    expect(await row(lost.sessionId, lost.id)).toBeUndefined()
    expect(await now.removeOrphans("unsaved")).toBeGreaterThanOrEqual(1)
    expect(await row(unsaved, idOf(ref))).toBeUndefined()
    expect(await objects.exists(`images/${owner.userId}/${unsaved}/${idOf(ref)}`)).toBe(false)
  })
})
