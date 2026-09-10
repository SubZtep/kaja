import type { DatasetAnswer, NasiStore, SessionWrite } from "@kaja/nasi"
import type { MemoryNote, MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { PersistedSessionSchema } from "@kaja/schema/store"
import type { Pool } from "pg"

function ownerKey(owner: string | null): string {
  return owner ?? ""
}
function ownerOf(key: string): string | null {
  return key === "" ? null : key
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function parseSession(row: {
  id: string
  created_at: Date | string
  updated_at: Date | string
  persona: string
  model: string
  title: string
  owner: string | null
  session: unknown
  events: unknown
}): PersistedSession | undefined {
  const parsed = PersistedSessionSchema.safeParse({
    id: row.id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    persona: row.persona,
    model: row.model,
    title: row.title,
    owner: row.owner,
    session: row.session,
    events: row.events
  })
  return parsed.success ? parsed.data : undefined
}

/** Postgres-backed store scoped to one account (`user_id`). `owner` still distinguishes widget/telegram rows. */
export function createPostgresStore(db: Pool, userId: string): NasiStore {
  return {
    async createSession(data: SessionWrite & { title: string }) {
      const id = Bun.randomUUIDv7()
      await db.query(
        `INSERT INTO nasi_session (id, user_id, persona, model, title, owner, session, events)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          id,
          userId,
          data.persona,
          data.model,
          data.title,
          data.owner,
          JSON.stringify(data.session),
          JSON.stringify(data.events)
        ]
      )
      return id
    },

    async updateSession(id, data) {
      await db.query(
        `UPDATE nasi_session
         SET updated_at = NOW(), persona = $3, model = $4, session = $5::jsonb, events = $6::jsonb
         WHERE id = $1 AND user_id = $2`,
        [id, userId, data.persona, data.model, JSON.stringify(data.session), JSON.stringify(data.events)]
      )
    },

    async loadSession(id) {
      const result = await db.query(
        `SELECT id, created_at, updated_at, persona, model, title, owner, session, events
         FROM nasi_session WHERE id = $1 AND user_id = $2`,
        [id, userId]
      )
      return result.rows[0] ? parseSession(result.rows[0]) : undefined
    },

    async loadLatestSession(owner) {
      const result =
        owner === null
          ? await db.query(
              `SELECT id, created_at, updated_at, persona, model, title, owner, session, events
               FROM nasi_session WHERE user_id = $1 AND owner IS NULL
               ORDER BY updated_at DESC, id DESC LIMIT 1`,
              [userId]
            )
          : await db.query(
              `SELECT id, created_at, updated_at, persona, model, title, owner, session, events
               FROM nasi_session WHERE user_id = $1 AND owner = $2
               ORDER BY updated_at DESC, id DESC LIMIT 1`,
              [userId, owner]
            )
      return result.rows[0] ? parseSession(result.rows[0]) : undefined
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
        `SELECT elem->>'text' AS text
         FROM nasi_session s
         CROSS JOIN LATERAL jsonb_array_elements(s.events) WITH ORDINALITY AS t(elem, ord)
         WHERE s.user_id = $1 AND elem->>'type' = 'user'
         ORDER BY s.updated_at DESC, s.id DESC, t.ord DESC
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

    async loadMemory(_owner) {
      const result = await db.query(
        `SELECT key, content, importance, tags, sticky, created_at, last_used_at, use_count
         FROM nasi_note WHERE user_id = $1`,
        [userId]
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

    async saveMemory(_owner, store) {
      const client = await db.connect()
      try {
        await client.query("BEGIN")
        await client.query("DELETE FROM nasi_note WHERE user_id = $1", [userId])
        for (const [key, note] of Object.entries(store)) {
          await client.query(
            `INSERT INTO nasi_note (user_id, key, content, importance, tags, sticky, created_at, last_used_at, use_count)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
            [
              userId,
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
    },

    async listDatasetVersionsSummary() {
      const result = await db.query(
        `SELECT a.topic AS topic, a.owner AS owner, a.version AS version,
                COUNT(*)::int AS "answeredCount", v.completed_at AS "completedAt"
         FROM nasi_dataset_answer a
         LEFT JOIN nasi_dataset_version v
           ON v.user_id = a.user_id AND v.topic = a.topic AND v.owner = a.owner AND v.version = a.version
         WHERE a.user_id = $1
         GROUP BY a.topic, a.owner, a.version, v.completed_at
         ORDER BY a.topic ASC, a.owner ASC, a.version ASC`,
        [userId]
      )
      return result.rows.map(row => ({
        topic: row.topic,
        owner: ownerOf(row.owner),
        version: row.version,
        answeredCount: row.answeredCount,
        completedAt: row.completedAt ?? undefined
      }))
    },

    async listAllDatasetAnswers() {
      const result = await db.query(
        `SELECT topic, owner, version, field, value, answered_at AS "answeredAt"
         FROM nasi_dataset_answer WHERE user_id = $1
         ORDER BY topic ASC, owner ASC, version ASC, answered_at ASC`,
        [userId]
      )
      return result.rows.map(row => ({
        topic: row.topic,
        owner: ownerOf(row.owner),
        version: row.version,
        field: row.field,
        value: row.value,
        answeredAt: row.answeredAt
      }))
    }
  }
}
