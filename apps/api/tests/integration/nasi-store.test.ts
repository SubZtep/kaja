import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { createSqlStore, sessionImagePrefix } from "@kaja/nasi"
import type { StoredConversation } from "@kaja/schema/store"
import { sql } from "../../src/core/db"
import { imageUrl, objects } from "../../src/core/files"
import { nasiStore } from "../../src/features/nasi/store"
import { noisyPng } from "../fixtures/images"
import { signUpAndSignIn } from "./helpers"

// The shared store's behaviour is packages/nasi/tests/store/sql-store.test.ts (SQLite); these are what Postgres adds
async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  await signUpAndSignIn(email, name)
  return (await sql`SELECT id FROM "user" WHERE email = ${email}`)[0].id as string
}

type Messages = StoredConversation["messages"]

const AT = "2026-09-21T00:00:00.000Z"

const call = (id: string, name: string) => ({ id, type: "function" as const, function: { name, arguments: "{}" } })
const TURN: Messages = [
  { role: "system", content: "be helpful" },
  { role: "user", content: "hi" },
  { role: "assistant", content: null, reasoning_content: "hmm", tool_calls: [call("c1", "read"), call("c2", "write")] },
  { role: "tool", tool_call_id: "c1", content: "ok" },
  { role: "user", content: [{ type: "image_url", image_url: { url: "kaja-image:0123456789abcdef" } }] }
]
const write = (messages: unknown[], extra = {}) => ({
  persona: "default",
  model: "m",
  owner: null,
  session: { messages },
  events: [] as unknown[],
  ...extra
})

describe("nasi store on Postgres", () => {
  let userId: string
  let otherId: string

  beforeAll(async () => {
    userId = await signUp("Store")
    otherId = await signUp("Store Other")
  })

  afterAll(async () => {
    await sql`DELETE FROM "user" WHERE id = ANY(${[userId, otherId]})`
  })

  test("a session round-trips through jsonb: pending call, granted tools and the timeline", async () => {
    const store = nasiStore(userId)
    const events = [
      { type: "user", text: "hi" },
      { type: "tool_call", name: "read", arguments: "{}" }
    ]
    const id = await store.createSession({
      ...write(TURN, { events }),
      session: { messages: TURN, pendingToolApprovalId: "c2", grantedTools: ["http:post"] },
      title: "hi"
    })
    const loaded = (await store.loadSession(id))!
    expect(loaded.session).toEqual({ id, messages: TURN, pendingToolApprovalId: "c2", grantedTools: ["http:post"] })
    expect(loaded.events).toEqual(events)
    const [row] = await sql`SELECT granted_tools FROM nasi_session WHERE id = ${id}`
    expect(row.granted_tools).toEqual(["http:post"])
    expect((await store.listSessions()).map(s => s.id)).toContain(id)
  })

  test("the channel follows the owner's prefix, and a terminal's 'local' is refused", async () => {
    const store = nasiStore(userId)
    const ids = await Promise.all(
      [null, "telegram:1", "widget:k:v"].map(owner => store.createSession({ ...write([]), owner, title: "t" }))
    )
    const rows = await sql`SELECT channel FROM nasi_session WHERE id IN ${sql(ids)} ORDER BY channel`
    expect(rows.map((r: { channel: string }) => r.channel)).toEqual(["telegram", "web", "widget"])
    const local = createSqlStore(sql, { userId, defaultChannel: "local", objects })
    await expect(local.createSession({ ...write([]), title: "t" })).rejects.toThrow("channel")
  })

  test("a session's images live under the account's prefix, served publicly, and leave with the session", async () => {
    const store = nasiStore(userId)
    const id = Bun.randomUUIDv7()
    const data = noisyPng(2, 2)
    const { ref, key } = await store.images(id).put({ data, mimeType: "image/png", width: 2, height: 2 })
    expect(key).toStartWith(`${sessionImagePrefix(id, userId)}/`)
    const messages: Messages = [{ role: "user", content: [{ type: "image_url", image_url: { url: ref } }] }]
    expect(await store.createSession({ ...write(messages, { session: { id, messages } }), title: "t" })).toBe(id)
    // images/ is public-read: anyone with the URL gets it, with its type
    const fetched = await fetch(imageUrl(key!))
    expect(fetched.status).toBe(200)
    expect(fetched.headers.get("content-type")).toBe("image/png")
    const imageId = ref.slice("kaja-image:".length)
    expect(await store.images(id).get(imageId)).toEqual({ data: new Uint8Array(data), mimeType: "image/png" })
    expect(await nasiStore(otherId).images(id).get(imageId)).toBeUndefined()

    await store.deleteSession(id)
    expect(await objects.exists(key!)).toBe(false)
    expect(await sql`SELECT 1 FROM nasi_image WHERE session_id = ${id}`).toHaveLength(0)
  })

  test("loading a session downloads no images: its messages keep their refs", async () => {
    const store = nasiStore(userId)
    const id = await store.createSession({ ...write(TURN), title: "t" })
    const download = spyOn(objects, "get")
    try {
      expect((await store.loadSession(id))!.session.messages).toEqual(TURN)
      expect(download).not.toHaveBeenCalled()
    } finally {
      download.mockRestore()
    }
  })

  test("a NUL byte in text or JSON (a binary tool result) is dropped instead of failing the save", async () => {
    const store = nasiStore(userId)
    const messages: Messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: null, tool_calls: [call("c1", "fetch_url")] },
      { role: "tool", tool_call_id: "c1", content: "\xff\xd8\0JFIF" },
      { role: "user", content: [{ type: "text", text: "a\0b" }] }
    ]
    const id = await store.createSession({
      ...write(messages, { events: [{ type: "user", text: "a\0b" }] }),
      title: "t"
    })
    const loaded = (await store.loadSession(id))!
    expect(loaded.session.messages[2]).toMatchObject({ content: "\xff\xd8JFIF" })
    expect(loaded.session.messages[3]).toMatchObject({ content: [{ type: "text", text: "ab" }] })
    expect(loaded.events).toEqual([{ type: "user", text: "ab" }])
  })

  test("memory notes keep their jsonb tags and boolean, per owner and per account", async () => {
    const store = nasiStore(userId)
    const note = {
      content: "web fact",
      importance: "medium" as const,
      tags: ["a", "b"],
      sticky: true,
      createdAt: "2026-09-21T00:00:00.000Z",
      lastUsedAt: "2026-09-21T00:00:00.000Z",
      useCount: 2
    }
    await store.saveMemory(null, { "user:web": note })
    await store.saveMemory("widget:abc:visitor-1", { "user:visitor": { ...note, sticky: false } })
    expect(await store.loadMemory(null)).toEqual({ "user:web": note })
    expect((await store.loadMemory("widget:abc:visitor-1"))["user:visitor"]!.sticky).toBe(false)
    expect(await nasiStore(otherId).loadMemory(null)).toEqual({})
  })

  test("dataset answers and versions read back as ISO text", async () => {
    const store = nasiStore(userId)
    await store.saveDatasetAnswer("profile", null, 1, "city", "Pécs")
    await store.markDatasetVersionComplete("profile", null, 1)
    const [answer] = await store.loadDatasetAnswers("profile", null, 1)
    expect(answer!.answeredAt).toMatch(/Z$/)
    expect(await store.loadDatasetVersionCompletedAt("profile", null, 1)).toMatch(/Z$/)
    expect(await store.latestDatasetVersion("profile", null)).toBe(1)
  })

  test("delete stays inside the account, and the rows go with the session", async () => {
    const store = nasiStore(userId)
    const id = await store.createSession({ ...write(TURN, { events: [{ type: "user", text: "hi" }] }), title: "t" })
    expect(await nasiStore(otherId).loadSession(id)).toBeUndefined()
    expect(await nasiStore(otherId).deleteSession(id)).toBe(false)

    expect(await store.deleteSession(id)).toBe(true)
    const [counts] = await sql`
      SELECT (SELECT COUNT(*) FROM nasi_message WHERE session_id = ${id})::int AS messages,
             (SELECT COUNT(*) FROM nasi_session_event WHERE session_id = ${id})::int AS events`
    expect(counts).toEqual({ messages: 0, events: 0 })
  })

  test("deleting the account deletes its sessions, timeline, notes and image rows", async () => {
    const gone = await signUp("Store Gone")
    const store = nasiStore(gone)
    const id = await store.createSession({ ...write(TURN, { events: [{ type: "user", text: "hi" }] }), title: "t" })
    await store.images(id).put({ data: noisyPng(2, 2), mimeType: "image/png", width: 2, height: 2 })
    await store.saveMemory(null, {
      k: { content: "c", importance: "low", tags: [], sticky: false, createdAt: AT, lastUsedAt: AT, useCount: 0 }
    })
    await sql`DELETE FROM "user" WHERE id = ${gone}`
    const [left] = await sql`
      SELECT (SELECT COUNT(*) FROM nasi_session WHERE user_id = ${gone})::int AS sessions,
             (SELECT COUNT(*) FROM nasi_session_event WHERE session_id = ${id})::int AS events,
             (SELECT COUNT(*) FROM nasi_note WHERE user_id = ${gone})::int AS notes,
             (SELECT COUNT(*) FROM nasi_image WHERE user_id = ${gone})::int AS images`
    expect(left).toEqual({ sessions: 0, events: 0, notes: 0, images: 0 })
  })

  test("a stored message the conversation schema doesn't know reads as no session, and is reported", async () => {
    const store = nasiStore(userId)
    const id = await store.createSession({ ...write(TURN), title: "t" })
    await sql`UPDATE nasi_message SET role = 'narrator' WHERE session_id = ${id} AND seq = 0`
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(await store.loadSession(id)).toBeUndefined()
      expect(logged).toHaveBeenCalledWith(
        "Stored session failed validation",
        expect.objectContaining({ sessionId: id })
      )
    } finally {
      logged.mockRestore()
    }
  })
})
