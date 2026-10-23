import { afterAll, beforeEach, expect, spyOn, test } from "bun:test"
import type { StoredConversation } from "@kaja/schema/store"
import { SQL } from "bun"
import { normalizeImage } from "../../src/images/normalize"
import { IMAGE_REF_PREFIX } from "../../src/store/images"
import { memoryObjects } from "../../src/store/objects"
import {
  bumpDescribeAttempt,
  createSqlStore,
  recordDescribeCall,
  recordDescribedImage
} from "../../src/store/sql-store"
import { SQLITE_SCHEMA } from "../../src/store/sqlite-schema"
import { png } from "../fixtures/images"

const sql = new SQL({ adapter: "sqlite", filename: ":memory:", strict: true })
await sql`PRAGMA foreign_keys = ON`
await sql.unsafe(SQLITE_SCHEMA)
afterAll(() => sql.close())

const USER = Bun.randomUUIDv7()
const OTHER = Bun.randomUUIDv7()
const objects = memoryObjects()
const storeFor = (userId: string, extra = {}) =>
  createSqlStore(sql, { userId, defaultChannel: "local", objects, ...extra })
const store = storeFor(USER)

beforeEach(async () => {
  await sql`DELETE FROM nasi_session`
  await sql`DELETE FROM nasi_image`
})

type Messages = StoredConversation["messages"]

const call = (id: string, name: string) => ({ id, type: "function" as const, function: { name, arguments: "{}" } })
const TURN: Messages = [
  { role: "system", content: "be helpful" },
  { role: "user", content: "hi" },
  { role: "assistant", content: null, reasoning_content: "hmm", tool_calls: [call("c1", "read"), call("c2", "write")] },
  { role: "tool", tool_call_id: "c1", content: "ok" },
  { role: "user", content: [{ type: "image_url", image_url: { url: "kaja-image:0123456789abcdef" } }] }
]
const EVENTS = [
  { type: "user", text: "hi" },
  { type: "reasoning", text: "hmm" },
  { type: "tool_call", name: "read", arguments: "{}" }
]
const write = (messages: unknown[], extra = {}) => ({
  persona: "default",
  model: "m",
  owner: null,
  session: { messages },
  events: [] as unknown[],
  ...extra
})

const count = async (table: string, sessionId: string) =>
  Number((await sql.unsafe(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`, [sessionId]))[0].n)

test("a session round-trips through its rows: pending call, granted tools and timeline included", async () => {
  const id = await store.createSession({
    ...write(TURN, { events: EVENTS }),
    session: { messages: TURN, pendingToolApprovalId: "c2", grantedTools: ["http:post"] },
    title: "hi"
  })
  const loaded = (await store.loadSession(id))!
  expect(loaded.session).toEqual({ id, messages: TURN, pendingToolApprovalId: "c2", grantedTools: ["http:post"] })
  expect(loaded.events).toEqual(EVENTS)
  expect(loaded.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  expect((await store.listSessions()).map(s => s.id)).toEqual([id])
})

test("the channel follows the owner's prefix, else the host's default", async () => {
  const ids = await Promise.all(
    [null, "telegram:1", "widget:k:v"].map(owner => store.createSession({ ...write([]), owner, title: "t" }))
  )
  const rows = await sql`SELECT channel FROM nasi_session WHERE id IN ${sql(ids)} ORDER BY channel`
  expect(rows.map((row: { channel: string }) => row.channel)).toEqual(["local", "telegram", "widget"])
})

test("an update appends only new messages and events, and links a result to its call", async () => {
  const id = await store.createSession({ ...write(TURN.slice(0, 3), { events: EVENTS.slice(0, 1) }), title: "t" })
  const ids = () => sql`SELECT id FROM nasi_message WHERE session_id = ${id} ORDER BY seq`
  const before = [...(await ids())]

  await store.updateSession(id, write(TURN, { events: EVENTS }))
  const after = [...(await ids())]
  expect(after).toHaveLength(before.length + 2)
  expect(after.slice(0, before.length)).toEqual(before)
  expect(await count("nasi_session_event", id)).toBe(EVENTS.length)

  const rows = await sql`
    SELECT tc.call_id AS call_id, r.content AS content
    FROM nasi_tool_call tc LEFT JOIN nasi_message r ON r.id = tc.result_message_id
    WHERE tc.message_id = ${before.at(-1)!.id} ORDER BY tc.position`
  expect([...rows]).toEqual([
    { call_id: "c1", content: "ok" },
    { call_id: "c2", content: null }
  ])
  expect((await store.loadSession(id))!.events).toEqual(EVENTS)
})

test("steps and tool calls keep what the agent recorded; a later save answers an earlier call", async () => {
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
      telemetry: {
        steps: [],
        calls: { c1: { approval: "approved" }, c2: { status: "declined", approval: "declined" } }
      }
    }
  })
  const steps = await sql`
    SELECT persona, model, prompt_tokens, completion_tokens, latency_ms, finish_reason
    FROM nasi_message WHERE session_id = ${id} AND latency_ms IS NOT NULL`
  expect([...steps]).toEqual([
    {
      persona: "kaja",
      model: "served",
      prompt_tokens: 10,
      completion_tokens: 4,
      latency_ms: 120,
      finish_reason: "tool_calls"
    }
  ])
  const calls = await sql`
    SELECT tc.call_id AS call_id, tc.status AS status, tc.duration_ms AS duration_ms, tc.approval AS approval
    FROM nasi_tool_call tc JOIN nasi_message m ON m.id = tc.message_id WHERE m.session_id = ${id} ORDER BY tc.position`
  expect([...calls]).toEqual([
    { call_id: "c1", status: "ok", duration_ms: 7, approval: "approved" },
    { call_id: "c2", status: "declined", duration_ms: null, approval: "declined" }
  ])
})

test("every compaction summary is kept once and the latest comes back, with the messages whole", async () => {
  const id = await store.createSession({ ...write(TURN), title: "t" })
  const longer: Messages = [...TURN, { role: "assistant", content: "sure" }]
  // Session indexes count the system prompt; the stored summary_from is the message seq, one less
  await store.updateSession(id, write(TURN, { session: { messages: TURN, summary: { text: "first", from: 2 } } }))
  await store.updateSession(id, write(longer, { session: { messages: longer, summary: { text: "first", from: 2 } } }))
  await store.updateSession(id, write(longer, { session: { messages: longer, summary: { text: "second", from: 4 } } }))

  const loaded = (await store.loadSession(id))!
  expect(loaded.session.summary).toEqual({ text: "second", from: 4 })
  expect(loaded.session.messages).toEqual(longer)
  const rows = await sql`
    SELECT summary_from, summary FROM nasi_session_summary WHERE session_id = ${id} ORDER BY summary_from`
  expect([...rows]).toEqual([
    { summary_from: 1, summary: "first" },
    { summary_from: 3, summary: "second" }
  ])
})

test("summarizer calls are stored once each", async () => {
  const modelCalls = [
    { kind: "condense" as const, model: "small", promptTokens: 900, completionTokens: 80, latencyMs: 3000 },
    { kind: "summarize" as const, model: "small", latencyMs: 1000 }
  ]
  const id = await store.createSession({
    ...write(TURN),
    session: { messages: TURN, telemetry: { steps: [], calls: {}, modelCalls } },
    title: "t"
  })
  // The store took the telemetry off, so a later save adds nothing
  await store.updateSession(id, write(TURN))
  const rows = await sql`
    SELECT kind, model, prompt_tokens, completion_tokens, latency_ms FROM nasi_model_call
    WHERE session_id = ${id} ORDER BY kind`
  expect([...rows]).toEqual([
    { kind: "condense", model: "small", prompt_tokens: 900, completion_tokens: 80, latency_ms: 3000 },
    { kind: "summarize", model: "small", prompt_tokens: null, completion_tokens: null, latency_ms: 1000 }
  ])
})

test("a condensed tool result is kept beside its call and never replaced; the message keeps the full output", async () => {
  const id = await store.createSession({
    ...write(TURN),
    session: { messages: TURN, toolSummaries: { c1: "condensed" } },
    title: "t"
  })
  await store.updateSession(id, write(TURN, { session: { messages: TURN, toolSummaries: { c1: "other" } } }))
  const loaded = (await store.loadSession(id))!
  expect(loaded.session.toolSummaries).toEqual({ c1: "condensed" })
  expect(loaded.session.messages).toEqual(TURN)
})

test("a rewritten system prompt changes no message rows", async () => {
  const id = await store.createSession({ ...write(TURN), title: "t" })
  const rewritten: Messages = [{ role: "system", content: "another persona" }, ...TURN.slice(1)]
  await store.updateSession(id, write(rewritten))
  expect((await store.loadSession(id))!.session.messages).toEqual(rewritten)
  expect(await count("nasi_message", id)).toBe(TURN.length - 1)
})

test("a NUL byte in a message (a binary tool result) is dropped instead of failing the save", async () => {
  const messages: Messages = [
    { role: "user", content: "hi" },
    { role: "assistant", content: null, tool_calls: [call("c1", "fetch_url")] },
    { role: "tool", tool_call_id: "c1", content: "\xff\xd8\0JFIF" },
    { role: "user", content: [{ type: "text", text: "a\0b" }] }
  ]
  const id = await store.createSession({ ...write(messages), title: "t" })
  const loaded = (await store.loadSession(id))!.session.messages
  expect(loaded[2]).toMatchObject({ content: "\xff\xd8JFIF" })
  expect(loaded[3]).toMatchObject({ content: [{ type: "text", text: "ab" }] })
})

test("update bumps updatedAt and the latest session follows it, per owner", async () => {
  const first = await store.createSession({ ...write([]), title: "first" })
  await Bun.sleep(2)
  const second = await store.createSession({ ...write([]), title: "second" })
  await Bun.sleep(2)
  const telegram = await store.createSession({ ...write([]), owner: "telegram:1", title: "tg" })
  expect((await store.loadLatestSession(null))!.id).toBe(second)
  expect((await store.loadLatestSession("telegram:1"))!.id).toBe(telegram)
  expect(await store.loadLatestSession("telegram:2")).toBeUndefined()

  const before = (await store.loadSession(first))!.updatedAt
  await Bun.sleep(2)
  await store.updateSession(first, write([], { model: "other" }))
  const after = (await store.loadSession(first))!
  expect(after.updatedAt > before).toBe(true)
  expect(after.model).toBe("other")
  expect((await store.loadLatestSession(null))!.id).toBe(first)
})

test("deleting a session takes its rows with it", async () => {
  const id = await store.createSession({
    ...write(TURN, { events: EVENTS }),
    session: { messages: TURN, summary: { text: "s", from: 2 } },
    title: "t"
  })
  expect(await store.deleteSession(id)).toBe(true)
  expect(await store.deleteSession(id)).toBe(false)
  for (const table of ["nasi_message", "nasi_session_event", "nasi_session_summary"])
    expect(await count(table, id)).toBe(0)
  const [orphans] =
    await sql`SELECT COUNT(*) AS n FROM nasi_tool_call WHERE message_id NOT IN (SELECT id FROM nasi_message)`
  expect(orphans.n).toBe(0)
})

test("prompt history is the account's user messages, newest session first, consecutive duplicates once", async () => {
  await store.createSession({
    ...write([
      { role: "user", content: "alpha" },
      { role: "assistant", content: "not a prompt" },
      { role: "user", content: "beta" }
    ]),
    title: "a"
  })
  await Bun.sleep(2)
  await store.createSession({
    ...write([
      { role: "user", content: "beta" },
      { role: "user", content: [{ type: "text", text: "parts are not history" }] },
      { role: "user", content: "gamma" }
    ]),
    title: "b"
  })
  expect(await store.loadPromptHistory()).toEqual(["gamma", "beta", "alpha"])
  expect(await store.loadPromptHistory(2)).toEqual(["gamma", "beta"])
  expect(await storeFor(OTHER).loadPromptHistory()).toEqual([])
})

test("events go through the host's mappers on the way out and back in", async () => {
  const mapped = storeFor(USER, {
    mapEventOut: (event: { path?: string }) => ({ ...event, path: undefined }),
    mapEventIn: (event: object) => ({ ...event, path: "/restored" })
  })
  const id = await mapped.createSession({
    ...write([], { events: [{ type: "tool_image", path: "/abs" }] }),
    title: "t"
  })
  const [stored] = await sql`SELECT payload FROM nasi_session_event WHERE session_id = ${id}`
  expect(JSON.parse(stored.payload)).toEqual({ type: "tool_image" })
  expect((await mapped.loadSession(id))!.events).toEqual([{ type: "tool_image", path: "/restored" }])
})

test("a stored session that no longer validates loads as missing and is reported", async () => {
  const onInvalid = spyOn({ onInvalid: (_id: string, _error: unknown) => {} }, "onInvalid")
  const reporting = storeFor(USER, { onInvalid })
  const id = await reporting.createSession({ ...write(TURN), title: "t" })
  await sql`UPDATE nasi_message SET role = 'narrator' WHERE session_id = ${id} AND seq = 0`
  expect(await reporting.loadSession(id)).toBeUndefined()
  expect(onInvalid).toHaveBeenCalledWith(id, expect.anything())
  await sql`UPDATE nasi_message SET role = 'user', parts = 'not json' WHERE session_id = ${id} AND seq = 0`
  expect(await reporting.loadSession(id)).toBeUndefined()
})

test("another account on the same database sees none of the sessions, images or notes", async () => {
  const other = storeFor(OTHER)
  const id = await store.createSession({ ...write(TURN), title: "t" })
  const image = await normalizeImage(png(2, 2))
  const { ref } = await store.images(id).put(image)
  const imageId = ref.slice(IMAGE_REF_PREFIX.length)
  await store.saveMemory(null, { k: note("mine") })

  expect(await other.loadSession(id)).toBeUndefined()
  expect(await other.loadLatestSession(null)).toBeUndefined()
  expect(await other.listSessions()).toEqual([])
  expect(await other.deleteSession(id)).toBe(false)
  await other.updateSession(id, write([...TURN, { role: "assistant", content: "taken over" }]))
  expect((await store.loadSession(id))!.session.messages).toEqual(TURN)
  expect(await other.images(id).description(imageId)).toBeUndefined()
  await other.images(id).clear()
  expect(await store.images(id).get(imageId)).toBeDefined()
  expect(await other.loadMemory(null)).toEqual({})
  await store.saveMemory(null, {})
})

const note = (content: string, extra = {}) => ({
  content,
  importance: "medium" as const,
  tags: ["fact"],
  sticky: false,
  createdAt: "2026-09-21T00:00:00.000Z",
  lastUsedAt: "2026-09-21T00:00:00.000Z",
  useCount: 0,
  ...extra
})

test("memory notes round-trip, and saving one owner's set replaces only that owner's", async () => {
  await store.saveMemory(null, { "user:web": note("web fact", { sticky: true, useCount: 3 }) })
  await store.saveMemory("telegram:7", { "user:tg": note("telegram fact") })
  expect(await store.loadMemory(null)).toEqual({ "user:web": note("web fact", { sticky: true, useCount: 3 }) })
  expect(Object.keys(await store.loadMemory("telegram:7"))).toEqual(["user:tg"])

  await store.saveMemory("telegram:7", {})
  expect(await store.loadMemory("telegram:7")).toEqual({})
  expect(Object.keys(await store.loadMemory(null))).toEqual(["user:web"])
  await store.saveMemory(null, {})
})

test("dataset answers upsert per field, and a version is completed once", async () => {
  expect(await store.latestDatasetVersion("profile", null)).toBe(0)
  await store.saveDatasetAnswer("profile", null, 1, "name", "Ann")
  await Bun.sleep(2)
  await store.saveDatasetAnswer("profile", null, 1, "city", "Pécs")
  await Bun.sleep(2)
  // A field answered again moves to its new time
  await store.saveDatasetAnswer("profile", null, 1, "name", "Anna")
  expect((await store.loadDatasetAnswers("profile", null, 1)).map(a => [a.field, a.value])).toEqual([
    ["city", "Pécs"],
    ["name", "Anna"]
  ])
  expect(await store.loadDatasetVersionCompletedAt("profile", null, 1)).toBeUndefined()
  await store.markDatasetVersionComplete("profile", null, 1)
  const completed = await store.loadDatasetVersionCompletedAt("profile", null, 1)
  await store.markDatasetVersionComplete("profile", null, 1)
  expect(await store.loadDatasetVersionCompletedAt("profile", null, 1)).toBe(completed!)
  await store.markDatasetVersionComplete("profile", null, 2)
  expect(await store.latestDatasetVersion("profile", null)).toBe(2)
  expect(await store.latestDatasetVersion("profile", "telegram:1")).toBe(0)
  expect(await storeFor(OTHER).latestDatasetVersion("profile", null)).toBe(0)
})

test("an image's row keeps its first source's URL, and a later arrival only fills what's still empty", async () => {
  const id = Bun.randomUUIDv7()
  const image = await normalizeImage(png(2, 2))
  await store.images(id).put(image, { fileName: "shot.png" })
  await store.images(id).put(image, { url: "https://a.example/x.png", alt: "x", fileName: "other.png" })
  await store.images(id).put(image, { url: "https://b.example/x.png", title: "X" })
  const rows =
    await sql`SELECT source_url, alt, title, file_name, mime_type, width FROM nasi_image WHERE session_id = ${id}`
  expect([...rows]).toEqual([
    {
      source_url: "https://a.example/x.png",
      alt: "x",
      title: "X",
      file_name: "shot.png",
      mime_type: "image/png",
      width: 2
    }
  ])
})

test("a session's images live under the host's prefix, and leave with the session", async () => {
  const id = Bun.randomUUIDv7()
  const local = storeFor(USER, { imagePrefix: (sessionId: string) => `images/${sessionId}` })
  const image = await normalizeImage(png(2, 2))
  const { ref, key } = await local.images(id).put(image)
  expect(key).toStartWith(`images/${id}/`)
  const messages: Messages = [{ role: "user", content: [{ type: "image_url", image_url: { url: ref } }] }]
  expect(await local.createSession({ ...write(messages), session: { id, messages }, title: "t" })).toBe(id)
  const imageId = ref.slice(IMAGE_REF_PREFIX.length)
  await local.images(id).describe(imageId, "Two pixels.", "vision-m")
  expect(await local.images(id).description(imageId)).toBe("Two pixels.")
  expect(await local.deleteSession(id)).toBe(true)
  expect(await objects.exists(key!)).toBe(false)
  expect(await count("nasi_image", id)).toBe(0)
})

test("an image still inline when a session is saved is stored then, so no row holds its bytes", async () => {
  const image = await normalizeImage(png(2, 2))
  const inline = `data:image/png;base64,${Buffer.from(image.data).toString("base64")}`
  const messages: Messages = [{ role: "user", content: [{ type: "image_url", image_url: { url: inline } }] }]
  const id = await store.createSession({ ...write(messages), title: "t" })
  const [row] = await sql`SELECT parts FROM nasi_message WHERE session_id = ${id}`
  expect(row.parts).toContain("kaja-image:")
  expect(row.parts).not.toContain("base64")
})

test("an image write waits for a save in flight instead of joining its transaction", async () => {
  const id = await store.createSession({ ...write([]), title: "t" })
  const image = await normalizeImage(png(3, 3))
  const failing = sql.begin(async tx => {
    await tx`UPDATE nasi_session SET title = ${"half saved"} WHERE id = ${id}`
    void store.images(id).put(image)
    await Bun.sleep(5)
    throw new Error("save failed")
  })
  await expect(failing).rejects.toThrow("save failed")
  await Bun.sleep(5)
  expect(await count("nasi_image", id)).toBe(1)
  expect((await store.loadSession(id))!.title).toBe("t")
})

test("describe bookkeeping: tries counted, the model call kept for a saved session, labels rewritten", async () => {
  const image = await normalizeImage(png(2, 2))
  const unsaved = Bun.randomUUIDv7()
  const { ref } = await store.images(unsaved).put(image, { alt: "a chart" })
  const imageId = ref.slice(IMAGE_REF_PREFIX.length)
  const label = `[Image ${ref} (2×2): a chart]`
  const messages: Messages = [
    {
      role: "user",
      content: [
        { type: "text", text: label },
        { type: "image_url", image_url: { url: ref } }
      ]
    }
  ]
  const usage = { model: "vision-m", promptTokens: 5, latencyMs: 9 }

  await bumpDescribeAttempt(sql, USER, unsaved, imageId)
  await bumpDescribeAttempt(sql, OTHER, unsaved, imageId)
  await recordDescribeCall(sql, USER, unsaved, usage)
  const [tried] = await sql`SELECT describe_attempts, describe_tried_at FROM nasi_image WHERE session_id = ${unsaved}`
  expect(tried.describe_attempts).toBe(1)
  expect(tried.describe_tried_at).toBeString()
  expect(await count("nasi_model_call", unsaved)).toBe(0)

  await store.createSession({ ...write(messages), session: { id: unsaved, messages }, title: "t" })
  await recordDescribeCall(sql, USER, unsaved, usage)
  await recordDescribeCall(sql, OTHER, unsaved, usage)
  expect(await count("nasi_model_call", unsaved)).toBe(1)

  await recordDescribedImage(
    sql,
    USER,
    { sessionId: unsaved, id: imageId, width: 2, height: 2 },
    "A bar chart.",
    "vision-m"
  )
  expect(await store.images(unsaved).description(imageId)).toBe("A bar chart.")
  const parts = (await store.loadSession(unsaved))!.session.messages[0]!.content as { text?: string }[]
  expect(parts[0]!.text).toBe(`[Image ${ref} (2×2): A bar chart.]`)
})
