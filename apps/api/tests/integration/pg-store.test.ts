import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { pool } from "../../src/core/db"
import { createPostgresStore } from "../../src/features/nasi/pg-store"
import { signUpAndSignIn } from "./helpers"

async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), name)
  return (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id as string
}

const call = (id: string, name: string) => ({ id, type: "function", function: { name, arguments: "{}" } })
const TURN = [
  { role: "system", content: "be helpful" },
  { role: "user", content: "hi" },
  { role: "assistant", content: null, reasoning_content: "hmm", tool_calls: [call("c1", "read"), call("c2", "write")] },
  { role: "tool", tool_call_id: "c1", content: "ok" },
  { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] }
]
const write = (messages: unknown[], extra = {}) => ({
  persona: "default",
  model: "m",
  owner: null,
  session: { messages },
  events: [],
  ...extra
})

describe("postgres store", () => {
  let userId: string
  let otherId: string

  beforeAll(async () => {
    userId = await signUp("Store")
    otherId = await signUp("Store Other")
  })

  afterAll(async () => {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[userId, otherId]])
  })

  test("a session round-trips through its rows, pending call included, with no timeline", async () => {
    const store = createPostgresStore(pool, userId)
    const id = await store.createSession({
      ...write(TURN, { events: [{ type: "user", text: "hi" }] }),
      session: { messages: TURN, pendingToolApprovalId: "c2" },
      title: "hi"
    })
    const loaded = (await store.loadSession(id))!
    expect(loaded.session).toEqual({ messages: TURN, pendingToolApprovalId: "c2" })
    expect(loaded.events).toEqual([])
    expect((await store.listSessions()).map(s => s.id)).toContain(id)
  })

  test("the channel follows the owner's prefix", async () => {
    const store = createPostgresStore(pool, userId)
    const ids = await Promise.all(
      [null, "telegram:1", "widget:k:v"].map(owner => store.createSession({ ...write([]), owner, title: "t" }))
    )
    const { rows } = await pool.query("SELECT channel FROM nasi_session WHERE id = ANY($1) ORDER BY channel", [ids])
    expect(rows.map(r => r.channel)).toEqual(["telegram", "web", "widget"])
  })

  test("an update appends only new messages and links a result to its call", async () => {
    const store = createPostgresStore(pool, userId)
    const id = await store.createSession({ ...write(TURN.slice(0, 3)), title: "t" })
    const ids = () => pool.query("SELECT id FROM nasi_message WHERE session_id = $1 ORDER BY seq", [id])
    const before = (await ids()).rows

    await store.updateSession(id, write(TURN))
    const after = (await ids()).rows
    expect(after).toHaveLength(before.length + 2)
    expect(after.slice(0, before.length)).toEqual(before)

    const { rows } = await pool.query(
      `SELECT tc.call_id, r.content FROM nasi_tool_call tc LEFT JOIN nasi_message r ON r.id = tc.result_message_id
       WHERE tc.message_id = $1 ORDER BY tc.position`,
      [before.at(-1)!.id]
    )
    expect(rows).toEqual([
      { call_id: "c1", content: "ok" },
      { call_id: "c2", content: null }
    ])
  })

  test("steps and tool calls keep what the agent recorded; a later save can answer an earlier call", async () => {
    const store = createPostgresStore(pool, userId)
    const telemetry = {
      steps: [
        {
          at: 1,
          model: "served",
          persona: "kaja",
          promptTokens: 10,
          completionTokens: 4,
          latencyMs: 120,
          finishReason: "tool_calls"
        }
      ],
      calls: { c1: { status: "ok" as const, durationMs: 7 } }
    }
    const session = { messages: TURN.slice(0, 4), telemetry }
    const id = await store.createSession({ ...write([]), session, title: "t" })
    expect(session).not.toHaveProperty("telemetry")

    await store.updateSession(id, {
      ...write([]),
      session: {
        messages: TURN.slice(0, 4),
        telemetry: { steps: [], calls: { c2: { status: "declined", approval: "declined" } } }
      }
    })
    const step = await pool.query(
      `SELECT persona, model, prompt_tokens, completion_tokens, finish_reason, latency_ms IS NOT NULL AS timed
       FROM nasi_message WHERE session_id = $1 AND latency_ms IS NOT NULL`,
      [id]
    )
    expect(step.rows).toEqual([
      {
        persona: "kaja",
        model: "served",
        prompt_tokens: 10,
        completion_tokens: 4,
        finish_reason: "tool_calls",
        timed: true
      }
    ])
    const calls = await pool.query(
      "SELECT tc.call_id, tc.status, tc.duration_ms, tc.approval FROM nasi_tool_call tc JOIN nasi_message m ON m.id = tc.message_id WHERE m.session_id = $1 ORDER BY tc.position",
      [id]
    )
    expect(calls.rows).toEqual([
      { call_id: "c1", status: "ok", duration_ms: 7, approval: null },
      { call_id: "c2", status: "declined", duration_ms: null, approval: "declined" }
    ])
  })

  test("every compaction summary is kept and the latest comes back, with the messages whole", async () => {
    const store = createPostgresStore(pool, userId)
    const id = await store.createSession({ ...write(TURN), title: "t" })
    const longer = [...TURN, { role: "assistant", content: "sure" }]
    // Session indexes count the system prompt; the stored summary_from is the message seq, one less.
    await store.updateSession(id, write(TURN, { session: { messages: TURN, summary: { text: "first", from: 2 } } }))
    await store.updateSession(id, write(longer, { session: { messages: longer, summary: { text: "first", from: 2 } } }))
    await store.updateSession(
      id,
      write(longer, { session: { messages: longer, summary: { text: "second", from: 4 } } })
    )

    const loaded = (await store.loadSession(id))!
    expect(loaded.session.summary).toEqual({ text: "second", from: 4 })
    expect(loaded.session.messages).toEqual(longer)
    const { rows } = await pool.query(
      "SELECT summary_from, summary FROM nasi_session_summary WHERE session_id = $1 ORDER BY summary_from",
      [id]
    )
    expect(rows).toEqual([
      { summary_from: 1, summary: "first" },
      { summary_from: 3, summary: "second" }
    ])
  })

  test("a rewritten system prompt changes no message rows", async () => {
    const store = createPostgresStore(pool, userId)
    const id = await store.createSession({ ...write(TURN), title: "t" })
    const rewritten = [{ role: "system", content: "another persona" }, ...TURN.slice(1)]
    await store.updateSession(id, write(rewritten))
    expect((await store.loadSession(id))!.session.messages).toEqual(rewritten)
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM nasi_message WHERE session_id = $1", [id])
    expect(rows[0].n).toBe(TURN.length - 1)
  })

  test("memory notes belong to their owner: the web app, a Telegram user and a widget visitor keep their own", async () => {
    const store = createPostgresStore(pool, userId)
    const note = (content: string) => ({
      content,
      importance: "medium" as const,
      tags: [],
      sticky: false,
      createdAt: "2026-09-21T00:00:00.000Z",
      lastUsedAt: "2026-09-21T00:00:00.000Z",
      useCount: 0
    })
    await store.saveMemory(null, { "user:web": note("web fact") })
    await store.saveMemory("telegram:7", { "user:tg": note("telegram fact") })
    await store.saveMemory("widget:abc:visitor-1", { "user:visitor": note("visitor fact") })

    expect(Object.keys(await store.loadMemory(null))).toEqual(["user:web"])
    expect(Object.keys(await store.loadMemory("telegram:7"))).toEqual(["user:tg"])
    expect(Object.keys(await store.loadMemory("widget:abc:visitor-1"))).toEqual(["user:visitor"])
    expect(await store.loadMemory("widget:abc:visitor-2")).toEqual({})

    // Saving one owner's notes replaces only that owner's set.
    await store.saveMemory("telegram:7", {})
    expect(await store.loadMemory("telegram:7")).toEqual({})
    expect(Object.keys(await store.loadMemory(null))).toEqual(["user:web"])
    expect(Object.keys(await store.loadMemory("widget:abc:visitor-1"))).toEqual(["user:visitor"])

    // Another account never sees them, even for the same owner.
    expect(await createPostgresStore(pool, otherId).loadMemory(null)).toEqual({})
  })

  test("delete removes the rows and stays inside the account", async () => {
    const store = createPostgresStore(pool, userId)
    const id = await store.createSession({ ...write(TURN), title: "t" })
    expect(await createPostgresStore(pool, otherId).loadSession(id)).toBeUndefined()
    expect(await createPostgresStore(pool, otherId).deleteSession(id)).toBe(false)

    expect(await store.deleteSession(id)).toBe(true)
    const { rows } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM nasi_message WHERE session_id = $1)::int AS messages,
        (SELECT COUNT(*) FROM nasi_tool_call tc JOIN nasi_message m ON m.id = tc.message_id WHERE m.session_id = $1)::int AS calls`,
      [id]
    )
    expect(rows[0]).toEqual({ messages: 0, calls: 0 })
  })

  test("prompt history is the account's user messages, newest first", async () => {
    const store = createPostgresStore(pool, otherId)
    await store.createSession({ ...write([{ role: "user", content: "first" }]), title: "a" })
    await Bun.sleep(3)
    await store.createSession({
      ...write([
        { role: "user", content: "second" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "third" }
      ]),
      title: "b"
    })
    expect(await store.loadPromptHistory()).toEqual(["third", "second", "first"])
    expect(await store.loadPromptHistory(1)).toEqual(["third"])
  })
})
