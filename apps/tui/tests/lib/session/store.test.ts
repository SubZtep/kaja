import { afterEach, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { StoredConversation } from "@kaja/schema/store"
import { SQL } from "bun"
import { TINY_PNG } from "../../fixtures/images"

// XDG_CONFIG_HOME is isolated too, since memory-store.ts can write
// config.memory.dbPath back into settings.toml on first successful open.
process.env.XDG_DATA_HOME = `${tmpdir()}/kaja-test-xdg-data-session`
process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-session`

const {
  createSessionRow,
  deleteSessionRow,
  listSessions,
  loadLatestSessionRow,
  loadLatestSessionRowForOwner,
  loadPromptHistory,
  loadSessionRow,
  updateSessionRow
} = await import("../../../lib/session/store")
const { getStore, peekStorePath } = await import("../../../lib/memory/store")

type Messages = StoredConversation["messages"]

const SESSION: StoredConversation = {
  messages: [
    { role: "system", content: "be helpful" },
    { role: "user", content: "hi" }
  ]
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    persona: "kaja",
    model: "test-model",
    title: "hi",
    owner: null,
    session: SESSION,
    events: [{ type: "user", text: "hi" }],
    ...overrides
  }
}

afterEach(async () => {
  for (const session of await listSessions()) await deleteSessionRow(session.id)
})

// A second, read-only connection to the store's file, as another process would open it while the TUI runs
const openDb = () => new SQL({ adapter: "sqlite", filename: peekStorePath()!, readonly: true })

test("create then load round-trips through the TUI's store, pending call and timeline included", async () => {
  const id = await createSessionRow(
    row({
      session: { ...SESSION, pendingAskUserId: "call_1" },
      events: [
        { type: "user", text: "hi" },
        { type: "ask_user", question: "why?" }
      ]
    })
  )
  const loaded = (await loadSessionRow(id))!
  expect(loaded).toMatchObject({ id, persona: "kaja", model: "test-model", title: "hi", owner: null })
  expect(loaded.session.messages).toEqual(SESSION.messages)
  expect(loaded.session.pendingAskUserId).toBe("call_1")
  expect(loaded.events).toEqual([
    { type: "user", text: "hi" },
    { type: "ask_user", question: "why?" }
  ])
  expect(await loadSessionRow("01900000-0000-7000-8000-000000000000")).toBeUndefined()
})

test("a terminal session is stored on the local channel, and its granted tools are kept", async () => {
  const id = await createSessionRow(row({ session: { ...SESSION, grantedTools: ["http:post_thing"] } }))
  expect((await loadSessionRow(id))!.session.grantedTools).toEqual(["http:post_thing"])
  const db = openDb()
  const [stored] = await db`SELECT channel, user_id FROM nasi_session WHERE id = ${id}`
  await db.close()
  expect(stored).toEqual({ channel: "local", user_id: "00000000-0000-7000-8000-000000000001" })
})

test("the latest session follows updates and stays with its owner", async () => {
  const first = await createSessionRow(row({ title: "first" }))
  await Bun.sleep(2)
  const second = await createSessionRow(row({ title: "second" }))
  await Bun.sleep(2)
  const telegram = await createSessionRow(row({ title: "telegram", owner: "telegram:1" }))
  expect((await loadLatestSessionRow())!.id).toBe(second)
  expect((await loadLatestSessionRowForOwner("telegram:1"))!.id).toBe(telegram)
  await Bun.sleep(2)
  await updateSessionRow(first, row({ model: "other-model" }))
  expect((await loadLatestSessionRow())!.id).toBe(first)
  expect((await listSessions()).map(s => s.id)).toEqual([first, telegram, second])
})

test("a session's images are files beside the database: its messages keep their refs, and deleting it removes them", async () => {
  const id = Bun.randomUUIDv7()
  const { ref } = await (
    await getStore()
  )
    .images(id)
    .put({ data: TINY_PNG, mimeType: "image/png", width: 1, height: 1 })
  const image = { type: "image_url" as const, image_url: { url: ref } }
  const messages: Messages = [
    { role: "user", content: [image] },
    { role: "assistant", content: "a picture" }
  ]
  expect(await createSessionRow(row({ session: { id, messages } }))).toBe(id)
  const folder = join(dirname(peekStorePath()!), "files", "images", id)
  expect(await readdir(folder)).toHaveLength(1)
  expect((await loadSessionRow(id))!.session).toEqual({ id, messages })
  expect(await deleteSessionRow(id)).toBe(true)
  expect(await readdir(folder).catch(() => [])).toHaveLength(0)
})

test("a timeline tool image is saved by its stored key and replays from the stored file", async () => {
  const id = Bun.randomUUIDv7()
  const { key } = await (
    await getStore()
  )
    .images(id)
    .put({ data: TINY_PNG, mimeType: "image/png", width: 1, height: 1 })
  const shown = { type: "tool_image", key, mimeType: "image/png", path: "/somewhere/it/was/shown.png" }
  await createSessionRow(row({ session: { id, messages: [] }, events: [shown] }))

  const db = openDb()
  const [stored] = await db`SELECT payload FROM nasi_session_event WHERE session_id = ${id}`
  await db.close()
  expect(JSON.parse(stored.payload)).toEqual({ type: "tool_image", key, mimeType: "image/png" })

  const [event] = (await loadSessionRow(id))!.events as { type: string; path: string; mimeType: string }[]
  expect(event).toMatchObject({ type: "tool_image", key, mimeType: "image/png" })
  expect(new Uint8Array(await Bun.file(event!.path).arrayBuffer())).toEqual(new Uint8Array(TINY_PNG))
})

test("prompt history is the terminal's user messages, newest first", async () => {
  await createSessionRow(
    row({
      session: {
        messages: [
          { role: "user", content: "alpha" },
          { role: "assistant", content: "not a prompt" },
          { role: "user", content: "beta" }
        ]
      }
    })
  )
  await Bun.sleep(2)
  await createSessionRow(row({ session: { messages: [{ role: "user", content: "gamma" }] } }))
  expect(await loadPromptHistory()).toEqual(["gamma", "beta", "alpha"])
})

test("timestamps are UTC instants whatever timezone the machine is in, so newest-first order holds across them", async () => {
  const originalTz = process.env.TZ
  const created: string[] = []
  try {
    for (const zone of ["Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati", "UTC"]) {
      process.env.TZ = zone
      const before = Date.now()
      const id = await createSessionRow(row({ title: zone }))
      const saved = (await loadSessionRow(id))!
      for (const stamp of [saved.createdAt, saved.updatedAt]) {
        expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
        // generous, the machine can be busy; a local-time stamp would be hours off
        expect(Math.abs(new Date(stamp).getTime() - before)).toBeLessThan(60_000)
      }
      created.push(id)
      await Bun.sleep(2)
    }
    expect((await listSessions()).map(s => s.id)).toEqual(created.toReversed())
  } finally {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  }
})
