import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import type { ImageStats, UsageStatsResponse } from "@kaja/schema/api"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { createPostgresStore } from "../../src/features/nasi/pg-store"
import { signUpAndSignIn } from "./helpers"

async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, name)
  const userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id as string
  return { token, userId }
}

async function seedSession(userId: string, title: string, owner: string | null = null) {
  return createPostgresStore(pool, userId).createSession({
    persona: "default",
    model: "m",
    owner,
    title,
    session: { messages: [] },
    events: []
  })
}

/** One image row, as a store writes it; `ageDays` dates it back. */
async function seedImage(
  userId: string,
  sessionId: string,
  bytes: number,
  opts: { url?: string; description?: string; ageDays?: number } = {}
) {
  const created = new Date(Date.now() - (opts.ageDays ?? 0) * 86_400_000)
  await pool.query(
    `INSERT INTO nasi_image (session_id, user_id, id, mime_type, width, height, bytes, source_url, description, created_at)
     VALUES ($1, $2, $3, 'image/png', 2, 2, $4, $5, $6, $7)`,
    [
      sessionId,
      userId,
      faker.string.hexadecimal({ length: 16, prefix: "" }).toLowerCase(),
      bytes,
      opts.url ?? null,
      opts.description ?? null,
      created
    ]
  )
}

describe("image stats", () => {
  let mine: { token: string; userId: string }
  let other: { token: string; userId: string }
  let admin: { token: string; userId: string }
  let big: string
  let small: string

  beforeAll(async () => {
    mine = await signUp("Images")
    other = await signUp("Other")
    admin = await signUp("Admin")
    await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin.userId])

    big = await seedSession(mine.userId, "Photos", "telegram:1")
    small = await seedSession(mine.userId, "Chat")
    await seedImage(mine.userId, big, 3000, { url: "https://www.Example.com/a.png", description: "A" })
    await seedImage(mine.userId, big, 2000, { url: "https://example.com/b.png" })
    await seedImage(mine.userId, small, 500, { url: "http://cdn.test:8080/c.jpg?x=1", ageDays: 20 })
    // A view_image file: no URL, so no site
    await seedImage(mine.userId, small, 100, { description: "D" })
    // A new session's image, before its first save: counted, but no chat to list it under
    await seedImage(mine.userId, Bun.randomUUIDv7(), 50)
    await seedImage(other.userId, await seedSession(other.userId, "Theirs"), 9999, { url: "https://theirs.test/x.png" })
  })

  afterAll(async () => {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[mine.userId, other.userId, admin.userId]])
  })

  const expected = (added: number, addedBytes: number): ImageStats => ({
    count: 5,
    bytes: 5650,
    described: 2,
    undescribed: 3,
    added,
    addedBytes,
    sites: [
      { host: "example.com", images: 2 },
      { host: "cdn.test", images: 1 }
    ],
    sessions: [
      { id: big, title: "Photos", channel: "telegram", images: 2, bytes: 5000 },
      { id: small, title: "Chat", channel: "web", images: 2, bytes: 600 }
    ]
  })

  test("/stats has the user's own images: all kept, and those added in the range", async () => {
    const get = async (days: number) => {
      const res = await app.request(`/stats?days=${days}`, { headers: { Authorization: `Bearer ${mine.token}` } })
      return ((await res.json()) as UsageStatsResponse).images
    }
    expect(await get(7)).toEqual(expected(4, 5150))
    expect(await get(30)).toEqual(expected(5, 5650))
    const res = await app.request("/stats", { headers: { Authorization: `Bearer ${other.token}` } })
    expect(((await res.json()) as UsageStatsResponse).images).toMatchObject({ count: 1, bytes: 9999 })
  })

  test("/admin/users/:id/images is for admins only, and shows the same numbers", async () => {
    const path = `/admin/users/${mine.userId}/images?days=7`
    expect((await app.request(path)).status).toBe(401)
    expect((await app.request(path, { headers: { Authorization: `Bearer ${mine.token}` } })).status).toBe(403)
    const res = await app.request(path, { headers: { Authorization: `Bearer ${admin.token}` } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(expected(4, 5150))
  })
})
