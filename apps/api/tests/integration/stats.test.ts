import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import type { CallStat, StepStat } from "@kaja/nasi"
import type { UsageStatsResponse } from "@kaja/schema/api"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { createPostgresStore } from "../../src/features/nasi/pg-store"
import { expectUnauthenticated, signUpAndSignIn } from "./helpers"

const toolCall = (name: string, id = `call_${name}`) => ({ id, type: "function", function: { name, arguments: "{}" } })

async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), name)
  const userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id as string
  return { token, userId }
}

/** One saved session, written through the store like a real turn and then dated back. */
async function seedSession(
  userId: string,
  opts: {
    ageDays: number
    owner?: string
    persona?: string
    model?: string
    messages?: unknown[]
    steps?: StepStat[]
    calls?: Record<string, CallStat>
  }
) {
  const id = await createPostgresStore(pool, userId).createSession({
    persona: opts.persona ?? "default",
    model: opts.model ?? "model-a",
    owner: opts.owner ?? null,
    title: "seed",
    session: { messages: opts.messages ?? [], telemetry: { steps: opts.steps ?? [], calls: opts.calls ?? {} } },
    events: []
  })
  // Older days sit at noon UTC so a run over midnight cannot move them to another day; today is "now", it cannot be later.
  const at = new Date()
  if (opts.ageDays > 0) {
    at.setUTCHours(12, 0, 0, 0)
    at.setUTCDate(at.getUTCDate() - opts.ageDays)
  }
  await pool.query("UPDATE nasi_session SET created_at = $2, updated_at = $2 WHERE id = $1", [id, at])
}

describe("GET /stats", () => {
  let mine: { token: string; userId: string }
  let other: { token: string; userId: string }

  const get = async (token: string, query = "") => {
    const res = await app.request(`/stats${query}`, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: (await res.json()) as UsageStatsResponse }
  }

  beforeAll(async () => {
    mine = await signUp("Stats")
    other = await signUp("Other")

    await seedSession(mine.userId, {
      ageDays: 0,
      persona: "care",
      messages: [
        { role: "system", content: "x" },
        { role: "user", content: "hi" },
        { role: "assistant", content: null, tool_calls: [toolCall("read_thing"), toolCall("write_thing", "call_w1")] },
        { role: "tool", tool_call_id: "call_read_thing", content: "ok" },
        { role: "tool", tool_call_id: "call_w1", content: "written" },
        { role: "user", content: "again" },
        {
          role: "assistant",
          content: null,
          tool_calls: [toolCall("read_thing", "call_read_2"), toolCall("write_thing", "call_w2")]
        },
        { role: "tool", tool_call_id: "call_w2", content: "User declined this request." }
      ],
      // rows: user 0, assistant 1, tool 2, tool 3, user 4, assistant 5, tool 6
      steps: [
        { at: 1, persona: "care", model: "model-a", promptTokens: 100, completionTokens: 20, latencyMs: 400 },
        { at: 5, persona: "care", model: "model-a", promptTokens: 50, completionTokens: 10, latencyMs: 200 }
      ],
      calls: {
        call_read_thing: { status: "ok", durationMs: 100 },
        call_read_2: { status: "error", durationMs: 300 },
        call_w1: { status: "ok", approval: "approved", durationMs: 50 },
        call_w2: { status: "declined", approval: "declined" }
      }
    })
    await seedSession(mine.userId, {
      ageDays: 2,
      owner: "telegram:99",
      model: "model-b",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hey" }
      ],
      steps: [{ at: 1, persona: "default", model: "model-b", promptTokens: 30, completionTokens: 5, latencyMs: 100 }]
    })
    await seedSession(mine.userId, {
      ageDays: 2,
      owner: "widget:visitor",
      messages: [
        { role: "user", content: "hey" },
        { role: "assistant", content: "hi" }
      ],
      steps: [{ at: 1, persona: "default", model: "model-a", promptTokens: 20, completionTokens: 5, latencyMs: 300 }]
    })
    // Older than the 7-day window used below.
    await seedSession(mine.userId, {
      ageDays: 20,
      messages: [{ role: "assistant", content: null, tool_calls: [toolCall("old_tool")] }]
    })
    // Someone else's session with a tool of their own.
    await seedSession(other.userId, {
      ageDays: 0,
      messages: [{ role: "assistant", content: null, tool_calls: [toolCall("their_tool")] }]
    })
  })

  afterAll(async () => {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[mine.userId, other.userId]])
  })

  test("needs a signed-in user", async () => {
    await expectUnauthenticated("/stats")
  })

  test("counts sessions, messages and tool calls in the window, and leaves older sessions out", async () => {
    const { status, body } = await get(mine.token, "?days=7")
    expect(status).toBe(200)
    expect(body.days).toBe(7)
    expect(body.totals).toEqual({
      sessions: 3,
      messages: 4,
      toolCalls: 4,
      promptTokens: 200,
      completionTokens: 40,
      avgLatencyMs: 250
    })
    expect(body.tools.map(tool => tool.name)).toEqual(["read_thing", "write_thing"])
  })

  test("says how each tool went: errors and the average time of the calls that were timed", async () => {
    const { body } = await get(mine.token, "?days=7")
    expect(body.tools[0]).toEqual({
      name: "read_thing",
      calls: 2,
      approved: 0,
      declined: 0,
      errors: 1,
      avgDurationMs: 200
    })
  })

  test("pairs each approval with the tool it asked about", async () => {
    const { body } = await get(mine.token, "?days=7")
    expect(body.tools.find(tool => tool.name === "write_thing")).toEqual({
      name: "write_thing",
      calls: 2,
      approved: 1,
      declined: 1,
      errors: 0,
      avgDurationMs: 50
    })
  })

  test("has one entry per day, zeros included, oldest first", async () => {
    const { body } = await get(mine.token, "?days=7")
    expect(body.perDay).toHaveLength(7)
    expect(body.perDay.map(day => day.date)).toEqual([...body.perDay.map(day => day.date)].sort())
    expect(body.perDay.reduce((sum, day) => sum + day.started, 0)).toBe(3)
    expect(body.perDay.reduce((sum, day) => sum + day.active, 0)).toBe(3)
    // Today's session is at most a moment old, so it sits in the last bucket, or the one before if the clock passed midnight.
    expect(body.perDay.slice(-2).reduce((sum, day) => sum + day.started, 0)).toBeGreaterThanOrEqual(1)
  })

  test("splits sessions by channel, and replies by persona and model", async () => {
    const { body } = await get(mine.token, "?days=7")
    expect(Object.fromEntries(body.channels.map(row => [row.channel, row.sessions]))).toEqual({
      web: 1,
      telegram: 1,
      widget: 1
    })
    expect(body.personas).toEqual([
      { persona: "care", replies: 2, sessions: 1 },
      { persona: "default", replies: 2, sessions: 2 }
    ])
    expect(body.models).toEqual([
      { model: "model-a", replies: 3, sessions: 2, promptTokens: 170, completionTokens: 35 },
      { model: "model-b", replies: 1, sessions: 1, promptTokens: 30, completionTokens: 5 }
    ])
  })

  test("a longer window brings older sessions in", async () => {
    const { body } = await get(mine.token, "?days=30")
    expect(body.totals.sessions).toBe(4)
    expect(body.tools.map(tool => tool.name)).toContain("old_tool")
  })

  test("never shows another user's sessions or tools", async () => {
    const { body } = await get(other.token, "?days=30")
    expect(body.totals).toEqual({
      sessions: 1,
      messages: 0,
      toolCalls: 1,
      promptTokens: 0,
      completionTokens: 0,
      avgLatencyMs: null
    })
    expect(body.tools.map(tool => tool.name)).toEqual(["their_tool"])
    const { body: mineBody } = await get(mine.token, "?days=30")
    expect(mineBody.tools.map(tool => tool.name)).not.toContain("their_tool")
  })

  test("rejects a window outside 1-365 days", async () => {
    const res = await app.request("/stats?days=0", { headers: { Authorization: `Bearer ${mine.token}` } })
    expect(res.status).toBe(400)
  })
})
