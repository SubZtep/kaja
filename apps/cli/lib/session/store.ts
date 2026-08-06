import { type PersistedSession, PersistedSessionSchema, type SessionMeta } from "@kaja/schema/store"
import { getDb } from "../memory/store"

/** Persists conversations to the sessions table (whole row rewritten per turn). Only depends on memory-store's connection, never agents.ts/openai.ts, so listing/resuming works without LLM config. */

type SessionRowData = {
  persona: string
  model: string
  /** Who this conversation belongs to — see schemas/session.ts's LOCAL_OWNER/telegramOwner. */
  owner: string | null
  /** lib/agents.ts Session — opaque here, serialized as JSON. */
  session: unknown
  /** hooks/use-agent.ts TimelineEvent[] — opaque here, serialized as JSON. */
  events: unknown[]
}

export async function createSessionRow(data: SessionRowData & { title: string }): Promise<number> {
  const database = await getDb()
  const now = new Date().toISOString()
  const result = database
    .query(`
      INSERT INTO sessions (createdAt, updatedAt, persona, model, title, owner, session, events)
      VALUES ($createdAt, $updatedAt, $persona, $model, $title, $owner, $session, $events)
    `)
    .run({
      $createdAt: now,
      $updatedAt: now,
      $persona: data.persona,
      $model: data.model,
      $title: data.title,
      $owner: data.owner,
      $session: JSON.stringify(data.session),
      $events: JSON.stringify(data.events)
    })
  return Number(result.lastInsertRowid)
}

export async function updateSessionRow(id: number, data: SessionRowData) {
  const database = await getDb()
  database
    .query(`
      UPDATE sessions
      SET updatedAt = $updatedAt, persona = $persona, model = $model,
          session = $session, events = $events
      WHERE id = $id
    `)
    .run({
      $id: id,
      $updatedAt: new Date().toISOString(),
      $persona: data.persona,
      $model: data.model,
      $session: JSON.stringify(data.session),
      $events: JSON.stringify(data.events)
    })
}

type SessionRow = Omit<PersistedSession, "session" | "events"> & {
  session: string
  events: string
}

const SESSION_COLUMNS = "id, createdAt, updatedAt, persona, model, title, owner, session, events"

/** A corrupt row (bad JSON or shape) resumes as nothing, not as a crash. */
function rowToSession(row: SessionRow): PersistedSession | undefined {
  try {
    const parsed = PersistedSessionSchema.safeParse({
      ...row,
      session: JSON.parse(row.session),
      events: JSON.parse(row.events)
    })
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

export async function loadSessionRow(id: number): Promise<PersistedSession | undefined> {
  const database = await getDb()
  const row = database
    .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = $id`)
    .get({ $id: id }) as SessionRow | null
  return row ? rowToSession(row) : undefined
}

/** Latest terminal session (owner IS NULL) by updatedAt — Telegram sessions never resumed via this. */
export async function loadLatestSessionRow(): Promise<PersistedSession | undefined> {
  const database = await getDb()
  const row = database
    .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner IS NULL ORDER BY updatedAt DESC, id DESC LIMIT 1`)
    .get() as SessionRow | null
  return row ? rowToSession(row) : undefined
}

/** Like loadLatestSessionRow, scoped to one owner (e.g. a Telegram user). */
export async function loadLatestSessionRowForOwner(owner: string): Promise<PersistedSession | undefined> {
  const database = await getDb()
  const row = database
    .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner = $owner ORDER BY updatedAt DESC, id DESC LIMIT 1`)
    .get({ $owner: owner }) as SessionRow | null
  return row ? rowToSession(row) : undefined
}

export async function deleteSessionRow(id: number): Promise<boolean> {
  const database = await getDb()
  const result = database.query("DELETE FROM sessions WHERE id = $id").run({ $id: id })
  return result.changes > 0
}

// Newest first, no payload blobs. Deliberately unscoped by owner — an accepted debugging escape hatch for operator tools.
export async function listSessions(): Promise<SessionMeta[]> {
  const database = await getDb()
  return database
    .query(
      "SELECT id, createdAt, updatedAt, persona, model, title, owner FROM sessions ORDER BY updatedAt DESC, id DESC"
    )
    .all() as SessionMeta[]
}

/** Past prompts across sessions, newest first, for shell-style ↑/↓ recall — derived from stored 'user' events, deduped like HISTCONTROL=ignoredups. */
export async function loadPromptHistory(limit = 100): Promise<string[]> {
  const database = await getDb()
  const rows = database
    .query(`
      SELECT je.value ->> 'text' AS text
      FROM sessions AS s, json_each(s.events) AS je
      WHERE je.value ->> 'type' = 'user'
      ORDER BY s.id DESC, je.key DESC
      LIMIT $limit
    `)
    .all({ $limit: limit }) as { text: unknown }[]

  const prompts: string[] = []
  for (const row of rows) {
    if (typeof row.text !== "string" || row.text.length === 0) continue
    if (prompts.at(-1) === row.text) continue
    prompts.push(row.text)
  }
  return prompts
}
