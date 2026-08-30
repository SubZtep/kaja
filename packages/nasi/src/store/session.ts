import { type PersistedSession, PersistedSessionSchema, type SessionMeta } from "@kaja/schema/store"
import { getDb } from "./db"

type SessionRowData = {
  persona: string
  model: string
  owner: string | null
  session: unknown
  events: unknown[]
}

export async function createSessionRow(data: SessionRowData & { title: string }): Promise<string> {
  const database = getDb()
  const now = new Date().toISOString()
  const id = Bun.randomUUIDv7()
  database
    .query(`
      INSERT INTO sessions (id, createdAt, updatedAt, persona, model, title, owner, session, events)
      VALUES ($id, $createdAt, $updatedAt, $persona, $model, $title, $owner, $session, $events)
    `)
    .run({
      $id: id,
      $createdAt: now,
      $updatedAt: now,
      $persona: data.persona,
      $model: data.model,
      $title: data.title,
      $owner: data.owner,
      $session: JSON.stringify(data.session),
      $events: JSON.stringify(data.events)
    })
  return id
}

export async function updateSessionRow(id: string, data: SessionRowData) {
  const database = getDb()
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

export async function loadSessionRow(id: string): Promise<PersistedSession | undefined> {
  const database = getDb()
  const row = database
    .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = $id`)
    .get({ $id: id }) as SessionRow | null
  return row ? rowToSession(row) : undefined
}

export async function loadLatestSessionRow(): Promise<PersistedSession | undefined> {
  const database = getDb()
  const row = database
    .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner IS NULL ORDER BY updatedAt DESC, id DESC LIMIT 1`)
    .get() as SessionRow | null
  return row ? rowToSession(row) : undefined
}

export async function loadLatestSessionRowForOwner(owner: string): Promise<PersistedSession | undefined> {
  const database = getDb()
  const row = database
    .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner = $owner ORDER BY updatedAt DESC, id DESC LIMIT 1`)
    .get({ $owner: owner }) as SessionRow | null
  return row ? rowToSession(row) : undefined
}

export async function deleteSessionRow(id: string): Promise<boolean> {
  const database = getDb()
  const result = database.query("DELETE FROM sessions WHERE id = $id").run({ $id: id })
  return result.changes > 0
}

export async function listSessions(): Promise<SessionMeta[]> {
  const database = getDb()
  return database
    .query(
      "SELECT id, createdAt, updatedAt, persona, model, title, owner FROM sessions ORDER BY updatedAt DESC, id DESC"
    )
    .all() as SessionMeta[]
}

export async function loadPromptHistory(limit = 100): Promise<string[]> {
  const database = getDb()
  const rows = database
    .query(`
      SELECT je.value ->> 'text' AS text
      FROM sessions AS s, json_each(s.events) AS je
      WHERE je.value ->> 'type' = 'user'
      ORDER BY s.updatedAt DESC, s.id DESC, je.key DESC
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
