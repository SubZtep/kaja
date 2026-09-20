import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"

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

const SESSION = {
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

test("create then load round-trips, including pending tool-call ids", async () => {
  const id = await createSessionRow(
    row({
      session: { ...SESSION, pendingAskUserId: "call_1" },
      events: [
        { type: "user", text: "hi" },
        { type: "ask_user", question: "why?" }
      ]
    })
  )
  const loaded = await loadSessionRow(id)
  expect(loaded).toBeDefined()
  expect(loaded!.id).toBe(id)
  expect(loaded!.persona).toBe("kaja")
  expect(loaded!.model).toBe("test-model")
  expect(loaded!.title).toBe("hi")
  expect(loaded!.owner).toBeNull()
  expect(loaded!.session.messages).toEqual(SESSION.messages)
  expect(loaded!.session.pendingAskUserId).toBe("call_1")
  expect(loaded!.events).toEqual([
    { type: "user", text: "hi" },
    { type: "ask_user", question: "why?" }
  ])
})

test("update bumps updatedAt and loadLatestSessionRow follows it", async () => {
  const first = await createSessionRow(row({ title: "first" }))
  await Bun.sleep(2)
  const second = await createSessionRow(row({ title: "second" }))
  expect((await loadLatestSessionRow())!.id).toBe(second)

  const before = (await loadSessionRow(first))!.updatedAt
  await Bun.sleep(2)
  await updateSessionRow(first, row({ model: "other-model" }))
  const after = (await loadSessionRow(first))!
  expect(after.updatedAt > before).toBe(true)
  expect(after.model).toBe("other-model")
  // the freshly updated (old) session is "latest" again
  expect((await loadLatestSessionRow())!.id).toBe(first)
})

test("loadSessionRow returns undefined for a missing id", async () => {
  expect(await loadSessionRow("01900000-0000-7000-8000-000000000000")).toBeUndefined()
})

async function openDb() {
  const { peekStorePath } = await import("../../../lib/memory/store")
  const { Database } = await import("bun:sqlite")
  return new Database(peekStorePath()!)
}

function count(
  db: Awaited<ReturnType<typeof openDb>>,
  table: "messages" | "session_events" | "tool_calls",
  id: string
) {
  const sql =
    table === "tool_calls"
      ? "SELECT COUNT(*) AS n FROM tool_calls tc JOIN messages m ON m.id = tc.messageId WHERE m.sessionId = ?"
      : `SELECT COUNT(*) AS n FROM ${table} WHERE sessionId = ?`
  return (db.query(sql).get(id) as { n: number }).n
}

test("a corrupt row loads as undefined instead of crashing", async () => {
  const id = await createSessionRow(
    row({
      session: {
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] }]
      }
    })
  )
  const db = await openDb()
  db.query("UPDATE messages SET parts = 'not json' WHERE sessionId = ?").run(id)
  db.close()
  expect(await loadSessionRow(id)).toBeUndefined()
})

const CALL = { id: "call_1", type: "function", function: { name: "read_thing", arguments: "{}" } }
const TURN_ONE = [
  ...SESSION.messages,
  { role: "assistant", content: null, reasoning_content: "hmm", tool_calls: [CALL] },
  { role: "tool", tool_call_id: "call_1", content: "ok" },
  { role: "assistant", content: "done" }
]
const TURN_ONE_EVENTS = [
  { type: "user", text: "hi" },
  { type: "reasoning", text: "hmm" },
  { type: "tool_call", name: "read_thing", arguments: "{}" },
  { type: "final", content: "done" }
]

test("messages, tool calls and the timeline round-trip, including events no message explains", async () => {
  const events = [
    ...TURN_ONE_EVENTS,
    { type: "persona_switch", personaId: "care", label: "Care" },
    { type: "display_image", url: "https://example.com/a.png", alt: "a" },
    { type: "error", text: "boom", category: "unknown" }
  ]
  const id = await createSessionRow(row({ session: { messages: TURN_ONE }, events }))
  const loaded = (await loadSessionRow(id))!
  expect(loaded.session.messages).toEqual(TURN_ONE)
  expect(loaded.events).toEqual(events)
})

test("a save writes only the rows past what is stored", async () => {
  const id = await createSessionRow(row({ session: { messages: TURN_ONE }, events: TURN_ONE_EVENTS }))
  const db = await openDb()
  const before = db.query("SELECT id FROM messages WHERE sessionId = ? ORDER BY seq").all(id)

  const next = [...TURN_ONE, { role: "user", content: "again" }, { role: "assistant", content: "sure" }]
  await updateSessionRow(
    id,
    row({ session: { messages: next }, events: [...TURN_ONE_EVENTS, { type: "user", text: "again" }] })
  )

  const after = db.query("SELECT id FROM messages WHERE sessionId = ? ORDER BY seq").all(id)
  expect(after).toHaveLength(before.length + 2)
  expect(after.slice(0, before.length)).toEqual(before)
  expect(count(db, "session_events", id)).toBe(TURN_ONE_EVENTS.length + 1)
  expect(count(db, "tool_calls", id)).toBe(1)
  db.close()
  expect((await loadSessionRow(id))!.session.messages).toEqual(next)
})

test("a tool call links to its result message and records an approval", async () => {
  const id = await createSessionRow(row({ session: { messages: TURN_ONE }, events: [] }))
  await updateSessionRow(id, {
    ...row({ session: { messages: TURN_ONE } }),
    approvals: [{ callId: "call_1", approved: false }]
  })
  const db = await openDb()
  const call = db
    .query(
      `SELECT tc.name, tc.approval, r.role AS resultRole, r.content AS resultContent
       FROM tool_calls tc JOIN messages m ON m.id = tc.messageId LEFT JOIN messages r ON r.id = tc.resultMessageId
       WHERE m.sessionId = ?`
    )
    .get(id)
  db.close()
  expect(call).toEqual({ name: "read_thing", approval: "declined", resultRole: "tool", resultContent: "ok" })
})

test("the system prompt is rewritten in place while the messages stay untouched", async () => {
  const id = await createSessionRow(row({ session: { messages: TURN_ONE } }))
  const rewritten = [{ role: "system", content: "now a different persona" }, ...TURN_ONE.slice(1)]
  await updateSessionRow(id, row({ session: { messages: rewritten } }))
  const db = await openDb()
  expect(count(db, "messages", id)).toBe(TURN_ONE.length - 1)
  db.close()
  expect((await loadSessionRow(id))!.session.messages).toEqual(rewritten)
})

test("deleting a session takes its messages, tool calls and timeline with it", async () => {
  const id = await createSessionRow(row({ session: { messages: TURN_ONE }, events: TURN_ONE_EVENTS }))
  expect(await deleteSessionRow(id)).toBe(true)
  const db = await openDb()
  expect(count(db, "messages", id)).toBe(0)
  expect(count(db, "session_events", id)).toBe(0)
  expect(
    db.query("SELECT COUNT(*) AS n FROM tool_calls WHERE messageId NOT IN (SELECT id FROM messages)").get()
  ).toEqual({
    n: 0
  })
  db.close()
})

test("the old blob-shaped sessions table is dropped when the store opens", async () => {
  const { Database } = await import("bun:sqlite")
  const path = `${tmpdir()}/kaja-legacy-sessions-${Bun.randomUUIDv7()}.sqlite`
  const legacy = new Database(path, { create: true })
  legacy.run(
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, createdAt TEXT, updatedAt TEXT, persona TEXT, model TEXT, title TEXT, owner TEXT, session TEXT NOT NULL, events TEXT NOT NULL)"
  )
  legacy.run("INSERT INTO sessions VALUES ('old', 'x', 'x', 'p', 'm', 't', NULL, '{}', '[]')")
  legacy.close()
  const { createSqliteStore } = await import("../../../lib/store/sqlite")
  const store = createSqliteStore(path)
  expect(await store.listSessions()).toEqual([])
  const id = await store.createSession({ ...row(), title: "new" })
  expect((await store.loadSession(id))!.session.messages).toEqual(SESSION.messages)
})

test("listSessions is newest first and carries no payload blobs", async () => {
  const a = await createSessionRow(row({ title: "a" }))
  await Bun.sleep(2)
  const b = await createSessionRow(row({ title: "b" }))
  const list = await listSessions()
  expect(list.map(s => s.id)).toEqual([b, a])
  expect(list[0]).not.toHaveProperty("session")
  expect(list[0]).not.toHaveProperty("events")
  expect(list[1]!.title).toBe("a")
})

test("loadLatestSessionRowForOwner scopes to one owner", async () => {
  const first = await createSessionRow(row({ title: "user1 session", owner: "telegram:1" }))
  await Bun.sleep(2)
  await createSessionRow(row({ title: "user2 session", owner: "telegram:2" }))

  const forUser1 = await loadLatestSessionRowForOwner("telegram:1")
  expect(forUser1!.id).toBe(first)
  expect(forUser1!.owner).toBe("telegram:1")
})

test("loadLatestSessionRow ignores non-null-owner rows, even newer ones", async () => {
  const localSession = await createSessionRow(row({ title: "local session", owner: null }))
  await Bun.sleep(2)
  await createSessionRow(row({ title: "telegram session", owner: "telegram:1" }))

  expect((await loadLatestSessionRow())!.id).toBe(localSession)
})

test("loadPromptHistory: newest first across sessions, user events only, consecutive dupes collapsed", async () => {
  await createSessionRow(
    row({
      events: [
        { type: "user", text: "alpha" },
        { type: "message", content: "not a prompt" },
        { type: "user", text: "beta" }
      ]
    })
  )
  await createSessionRow(
    row({
      events: [
        { type: "user", text: "beta" },
        { type: "user", text: "gamma" }
      ]
    })
  )
  // newest session's newest prompt first; "beta" appears once at the seam
  expect(await loadPromptHistory()).toEqual(["gamma", "beta", "alpha"])
  expect(await loadPromptHistory(2)).toEqual(["gamma", "beta"])
})
