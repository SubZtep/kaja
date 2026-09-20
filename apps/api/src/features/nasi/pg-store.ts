import {
  clearTelemetry,
  type DatasetAnswer,
  joinConversation,
  type MessageRow,
  type NasiStore,
  type PendingKind,
  type SessionWrite,
  splitConversation
} from "@kaja/nasi"
import type { MemoryNote, MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { channelOf, PersistedSessionSchema } from "@kaja/schema/store"
import type { Pool, PoolClient } from "pg"

function ownerKey(owner: string | null): string {
  return owner ?? ""
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

type SessionRow = {
  id: string
  created_at: Date | string
  updated_at: Date | string
  persona: string
  model: string
  title: string
  owner: string | null
  system_prompt: string | null
  pending_call_id: string | null
  pending_kind: PendingKind | null
}

const SESSION_COLUMNS =
  "id, created_at, updated_at, persona, model, title, owner, system_prompt, pending_call_id, pending_kind"

/** Rebuilds a session from its rows. The cloud keeps no timeline, so `events` is always empty. */
async function hydrate(db: Pool, row: SessionRow): Promise<PersistedSession | undefined> {
  const [messages, calls] = await Promise.all([
    db.query(
      "SELECT role, content, parts, reasoning, tool_call_id FROM nasi_message WHERE session_id = $1 ORDER BY seq",
      [row.id]
    ),
    db.query(
      `SELECT m.seq, tc.call_id, tc.name, tc.arguments
       FROM nasi_tool_call tc JOIN nasi_message m ON m.id = tc.message_id
       WHERE m.session_id = $1 ORDER BY m.seq, tc.position`,
      [row.id]
    )
  ])
  const callsBySeq = Map.groupBy(calls.rows, call => call.seq as number)
  const parsed = PersistedSessionSchema.safeParse({
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    persona: row.persona,
    model: row.model,
    title: row.title,
    owner: row.owner,
    session: joinConversation({
      systemPrompt: row.system_prompt,
      pending: row.pending_call_id && row.pending_kind ? { callId: row.pending_call_id, kind: row.pending_kind } : null,
      messages: messages.rows.map((message, seq) => ({
        role: message.role,
        content: message.content,
        parts: message.parts,
        reasoning: message.reasoning,
        toolCallId: message.tool_call_id,
        toolCalls: (callsBySeq.get(seq) ?? []).map(call => ({
          callId: call.call_id,
          name: call.name,
          arguments: call.arguments
        }))
      }))
    }),
    events: []
  })
  return parsed.success ? parsed.data : undefined
}

async function insertMessage(client: PoolClient, sessionId: string, seq: number, row: MessageRow) {
  const id = Bun.randomUUIDv7()
  await client.query(
    `INSERT INTO nasi_message (id, session_id, seq, role, content, parts, reasoning, tool_call_id,
                               persona, model, prompt_tokens, completion_tokens, latency_ms, finish_reason)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      sessionId,
      seq,
      row.role,
      row.content,
      row.parts ? JSON.stringify(row.parts) : null,
      row.reasoning,
      row.toolCallId,
      row.step?.persona ?? null,
      row.step?.model ?? null,
      row.step?.promptTokens ?? null,
      row.step?.completionTokens ?? null,
      row.step?.latencyMs ?? null,
      row.step?.finishReason ?? null
    ]
  )
  for (const [position, call] of row.toolCalls.entries()) {
    await client.query(
      `INSERT INTO nasi_tool_call (id, message_id, position, call_id, name, arguments)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [Bun.randomUUIDv7(), id, position, call.callId, call.name, call.arguments]
    )
  }
  if (row.role === "tool" && row.toolCallId) {
    await client.query(
      `UPDATE nasi_tool_call SET result_message_id = $1
       WHERE call_id = $2 AND message_id IN (SELECT id FROM nasi_message WHERE session_id = $3)`,
      [id, row.toolCallId, sessionId]
    )
  }
}

// The conversation is append-only apart from the system prompt, so a save writes just the rows past what's stored.
async function saveConversation(client: PoolClient, id: string, data: SessionWrite) {
  const { systemPrompt, pending, messages, calls = [] } = splitConversation(data.session)
  await client.query(
    "UPDATE nasi_session SET system_prompt = $2, pending_call_id = $3, pending_kind = $4 WHERE id = $1",
    [id, systemPrompt, pending?.callId ?? null, pending?.kind ?? null]
  )
  const stored = await client.query("SELECT COUNT(*)::int AS n FROM nasi_message WHERE session_id = $1", [id])
  const storedMessages = stored.rows[0].n as number
  for (const [i, row] of messages.slice(storedMessages).entries()) {
    await insertMessage(client, id, storedMessages + i, row)
  }
  for (const { callId, status, approval, durationMs } of calls) {
    await client.query(
      `UPDATE nasi_tool_call
       SET status = COALESCE($3, status), approval = COALESCE($4, approval), duration_ms = COALESCE($5, duration_ms)
       WHERE call_id = $2 AND message_id IN (SELECT id FROM nasi_message WHERE session_id = $1)`,
      [id, callId, status ?? null, approval ?? null, durationMs ?? null]
    )
  }
}

async function inTransaction<T>(db: Pool, body: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect()
  try {
    await client.query("BEGIN")
    const result = await body(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/** Postgres-backed store scoped to one account (`user_id`). `owner` still distinguishes widget/telegram rows. */
export function createPostgresStore(db: Pool, userId: string): NasiStore {
  return {
    async createSession(data: SessionWrite & { title: string }) {
      const id = Bun.randomUUIDv7()
      await inTransaction(db, async client => {
        await client.query(
          `INSERT INTO nasi_session (id, user_id, persona, model, title, owner, channel)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, userId, data.persona, data.model, data.title, data.owner, channelOf(data.owner)]
        )
        await saveConversation(client, id, data)
      })
      clearTelemetry(data.session)
      return id
    },

    async updateSession(id, data) {
      await inTransaction(db, async client => {
        const result = await client.query(
          "UPDATE nasi_session SET updated_at = NOW(), persona = $3, model = $4 WHERE id = $1 AND user_id = $2",
          [id, userId, data.persona, data.model]
        )
        if ((result.rowCount ?? 0) > 0) await saveConversation(client, id, data)
      })
      clearTelemetry(data.session)
    },

    async loadSession(id) {
      const result = await db.query(`SELECT ${SESSION_COLUMNS} FROM nasi_session WHERE id = $1 AND user_id = $2`, [
        id,
        userId
      ])
      return result.rows[0] ? hydrate(db, result.rows[0]) : undefined
    },

    async loadLatestSession(owner) {
      const result =
        owner === null
          ? await db.query(
              `SELECT ${SESSION_COLUMNS} FROM nasi_session WHERE user_id = $1 AND owner IS NULL
               ORDER BY updated_at DESC, id DESC LIMIT 1`,
              [userId]
            )
          : await db.query(
              `SELECT ${SESSION_COLUMNS} FROM nasi_session WHERE user_id = $1 AND owner = $2
               ORDER BY updated_at DESC, id DESC LIMIT 1`,
              [userId, owner]
            )
      return result.rows[0] ? hydrate(db, result.rows[0]) : undefined
    },

    async deleteSession(id) {
      const result = await db.query("DELETE FROM nasi_session WHERE id = $1 AND user_id = $2", [id, userId])
      return (result.rowCount ?? 0) > 0
    },

    async listSessions(): Promise<SessionMeta[]> {
      const result = await db.query(
        `SELECT id, created_at, updated_at, persona, model, title, owner
         FROM nasi_session WHERE user_id = $1
         ORDER BY updated_at DESC, id DESC`,
        [userId]
      )
      return result.rows.map(row => ({
        id: row.id,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        persona: row.persona,
        model: row.model,
        title: row.title,
        owner: row.owner
      }))
    },

    async loadPromptHistory(limit = 100) {
      const result = await db.query(
        `SELECT m.content AS text
         FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
         WHERE s.user_id = $1 AND m.role = 'user' AND m.content IS NOT NULL
         ORDER BY s.updated_at DESC, s.id DESC, m.seq DESC
         LIMIT $2`,
        [userId, limit]
      )
      const prompts: string[] = []
      for (const row of result.rows) {
        if (typeof row.text !== "string" || row.text.length === 0) continue
        if (prompts.at(-1) === row.text) continue
        prompts.push(row.text)
      }
      return prompts
    },

    async loadMemory(owner) {
      const result = await db.query(
        `SELECT key, content, importance, tags, sticky, created_at, last_used_at, use_count
         FROM nasi_note WHERE user_id = $1 AND owner = $2`,
        [userId, ownerKey(owner)]
      )
      const store: MemoryStore = {}
      for (const row of result.rows) {
        store[row.key] = {
          content: row.content,
          importance: row.importance as MemoryNote["importance"],
          tags: row.tags,
          sticky: row.sticky,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
          useCount: row.use_count
        }
      }
      return store
    },

    async saveMemory(owner, store) {
      const client = await db.connect()
      try {
        await client.query("BEGIN")
        await client.query("DELETE FROM nasi_note WHERE user_id = $1 AND owner = $2", [userId, ownerKey(owner)])
        for (const [key, note] of Object.entries(store)) {
          await client.query(
            `INSERT INTO nasi_note (user_id, owner, key, content, importance, tags, sticky, created_at, last_used_at, use_count)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
            [
              userId,
              ownerKey(owner),
              key,
              note.content,
              note.importance,
              JSON.stringify(note.tags),
              note.sticky,
              note.createdAt,
              note.lastUsedAt,
              note.useCount
            ]
          )
        }
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },

    async latestDatasetVersion(topic, owner) {
      const result = await db.query(
        `SELECT MAX(version) AS version FROM (
           SELECT version FROM nasi_dataset_answer WHERE user_id = $1 AND topic = $2 AND owner = $3
           UNION ALL
           SELECT version FROM nasi_dataset_version WHERE user_id = $1 AND topic = $2 AND owner = $3
         ) t`,
        [userId, topic, ownerKey(owner)]
      )
      return result.rows[0]?.version ?? 0
    },

    async loadDatasetAnswers(topic, owner, version) {
      const result = await db.query(
        `SELECT field, value, answered_at AS "answeredAt" FROM nasi_dataset_answer
         WHERE user_id = $1 AND topic = $2 AND owner = $3 AND version = $4
         ORDER BY answered_at ASC`,
        [userId, topic, ownerKey(owner), version]
      )
      return result.rows as DatasetAnswer[]
    },

    async saveDatasetAnswer(topic, owner, version, field, value) {
      await db.query(
        `INSERT INTO nasi_dataset_answer (user_id, topic, owner, version, field, value, answered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, topic, owner, version, field)
         DO UPDATE SET value = EXCLUDED.value, answered_at = EXCLUDED.answered_at`,
        [userId, topic, ownerKey(owner), version, field, value, new Date().toISOString()]
      )
    },

    async markDatasetVersionComplete(topic, owner, version) {
      await db.query(
        `INSERT INTO nasi_dataset_version (user_id, topic, owner, version, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, topic, owner, version) DO NOTHING`,
        [userId, topic, ownerKey(owner), version, new Date().toISOString()]
      )
    },

    async loadDatasetVersionCompletedAt(topic, owner, version) {
      const result = await db.query(
        `SELECT completed_at FROM nasi_dataset_version
         WHERE user_id = $1 AND topic = $2 AND owner = $3 AND version = $4`,
        [userId, topic, ownerKey(owner), version]
      )
      return result.rows[0]?.completed_at as string | undefined
    }
  }
}
