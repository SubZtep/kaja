import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { faker } from "@faker-js/faker"
import type { AdminImagesResponse } from "@kaja/schema/api"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { objects } from "../../src/core/files"
import { nasiStore } from "../../src/features/nasi/store"
import { noisyPng } from "../fixtures/images"
import { signUpAndSignIn } from "./helpers"

async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, name)
  const userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id as string
  return { token, userId, email }
}

const hexId = () => faker.string.hexadecimal({ length: 16, prefix: "" }).toLowerCase()

describe("/admin/images", () => {
  let admin: Awaited<ReturnType<typeof signUp>>
  let owner: Awaited<ReturnType<typeof signUp>>
  let crowd: Awaited<ReturnType<typeof signUp>>
  let session: string
  let unsaved: string

  const list = async (query: string, token = admin.token) => {
    const res = await app.request(`/admin/images?${query}`, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: (await res.json()) as AdminImagesResponse }
  }
  const ids = (body: AdminImagesResponse) =>
    body.images.map(image => image.source.fileName ?? image.source.url ?? image.id)

  beforeAll(async () => {
    admin = await signUp("Admin")
    owner = await signUp("Owner")
    crowd = await signUp("Crowd")
    await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin.userId])

    const store = nasiStore(owner.userId)
    session = await store.createSession({
      persona: "default",
      model: "m",
      owner: null,
      title: "Trip",
      session: { messages: [] },
      events: []
    })
    unsaved = Bun.randomUUIDv7()
    const put = (sessionId: string, source?: Parameters<ReturnType<typeof store.images>["put"]>[1]) =>
      store.images(sessionId).put({ data: noisyPng(2, 2), mimeType: "image/png", width: 2, height: 2 }, source)
    // Oldest first, so the list (newest first) reads them backwards
    await put(session, { url: "https://www.Example.com/a.png", alt: "A" })
    await put(session, { url: "https://other.test/b.png" })
    await put(session, { fileName: "shot.png" })
    await put(unsaved)
    const { ref } = await put(session, { url: "https://example.com/e.png" })
    await store.images(session).describe(ref.slice("kaja-image:".length), "A cat.", "vision-m")

    // More than a page, all at the same moment, so the cursor's tie-breaks are what keeps them apart
    const crowdSession = Bun.randomUUIDv7()
    const at = new Date()
    for (let i = 0; i < 50; i++)
      await pool.query(
        `INSERT INTO nasi_image (session_id, user_id, id, mime_type, width, height, bytes, created_at)
         VALUES ($1, $2, $3, 'image/png', 1, 1, 1, $4)`,
        [crowdSession, crowd.userId, hexId(), at]
      )
  })

  afterAll(async () => {
    await nasiStore(owner.userId).deleteSession(session)
    await nasiStore(owner.userId).images(unsaved).clear()
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[admin.userId, owner.userId, crowd.userId]])
  })

  test("is for admins only", async () => {
    expect((await app.request("/admin/images")).status).toBe(401)
    expect((await list("", owner.token)).status).toBe(403)
    const res = await app.request(`/admin/images/${session}/${hexId()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.token}` }
    })
    expect(res.status).toBe(403)
  })

  test("lists a user's images newest first, with their user, session and public URL", async () => {
    const { body } = await list(`user=${owner.userId}`)
    expect(ids(body)).toEqual([
      "https://example.com/e.png",
      body.images[1]!.id,
      "shot.png",
      "https://other.test/b.png",
      "https://www.Example.com/a.png"
    ])
    expect(body.next).toBeNull()
    const [described, fromUnsaved] = body.images
    expect(described).toMatchObject({
      user: { id: owner.userId, email: owner.email, name: "Owner" },
      session: { title: "Trip", channel: "web" },
      description: "A cat.",
      descriptionModel: "vision-m",
      mimeType: "image/png",
      width: 2
    })
    expect(described!.url).toEndWith(`/images/${owner.userId}/${session}/${described!.id}`)
    expect(fromUnsaved).toMatchObject({ sessionId: unsaved, session: null, source: {} })
  })

  test("filters by site (any case, with or without www.), description and origin, all combined", async () => {
    const owned = `user=${owner.userId}`
    expect(ids((await list(`${owned}&site=WWW.example.com`)).body)).toEqual([
      "https://example.com/e.png",
      "https://www.Example.com/a.png"
    ])
    expect(ids((await list(`${owned}&site=example.com&undescribed=true`)).body)).toEqual([
      "https://www.Example.com/a.png"
    ])
    expect((await list(`${owned}&undescribed=false`)).body.images).toHaveLength(1)
    expect(ids((await list(`${owned}&origin=file`)).body)).toEqual(["shot.png"])
    expect((await list(`${owned}&origin=url`)).body.images).toHaveLength(3)
    expect((await list(`${owned}&origin=none`)).body.images.map(image => image.sessionId)).toEqual([unsaved])
  })

  test("pages through more than a page without repeating or skipping one", async () => {
    const first = await list(`user=${crowd.userId}`)
    expect(first.body.images).toHaveLength(48)
    const second = await list(`user=${crowd.userId}&cursor=${first.body.next}`)
    expect(second.body.images).toHaveLength(2)
    expect(second.body.next).toBeNull()
    const all = [...first.body.images, ...second.body.images].map(image => image.id)
    expect(new Set(all).size).toBe(50)
    expect((await list("cursor=nonsense")).status).toBe(400)
  })

  test("removing an image deletes its object and its row, and says who did it", async () => {
    const { body } = await list(`user=${owner.userId}&origin=file`)
    const image = body.images[0]!
    const key = `images/${owner.userId}/${session}/${image.id}`
    expect(await objects.exists(key)).toBe(true)
    const info = spyOn(console, "info").mockImplementation(() => {})
    const remove = () =>
      app.request(`/admin/images/${session}/${image.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${admin.token}` }
      })
    try {
      expect((await remove()).status).toBe(200)
      expect(info).toHaveBeenCalledWith("Admin removed an image", {
        admin: admin.userId,
        user: owner.userId,
        sessionId: session,
        id: image.id
      })
    } finally {
      info.mockRestore()
    }
    expect(await objects.exists(key)).toBe(false)
    expect((await list(`user=${owner.userId}&origin=file`)).body.images).toHaveLength(0)
    expect((await remove()).status).toBe(404)
  })
})
