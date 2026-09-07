import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { NasiStore, SessionWrite } from "@kaja/nasi"
import type { MemoryNote, MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { PersistedSessionSchema } from "@kaja/schema/store"

const SCHEMA_VERSION = 8

function ownerKey(owner: string | null): string {
  return owner ?? ""
}
function ownerOf(key: string): string | null {
  return key === "" ? null : key
}

function createSchema(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      key         TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      importance  TEXT NOT NULL CHECK (importance IN ('low','medium','high')),
      tags        TEXT NOT NULL,
      sticky      INTEGER NOT NULL,
      createdAt   TEXT NOT NULL,
      lastUsedAt  TEXT NOT NULL,
      useCount    INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id        TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      persona   TEXT NOT NULL,
      model     TEXT NOT NULL,
      title     TEXT NOT NULL,
      owner     TEXT,
      session   TEXT NOT NULL,
      events    TEXT NOT NULL
    )
  `)
  db.exec("CREATE INDEX IF NOT EXISTS sessions_updatedAt_idx ON sessions (updatedAt DESC)")
  db.exec("CREATE INDEX IF NOT EXISTS sessions_owner_updatedAt_idx ON sessions (owner, updatedAt DESC)")
  db.exec(`
    CREATE TABLE IF NOT EXISTS dataset_answers (
      topic      TEXT NOT NULL,
      owner      TEXT NOT NULL,
      version    INTEGER NOT NULL,
      field      TEXT NOT NULL,
      value      TEXT NOT NULL,
      answeredAt TEXT NOT NULL,
      PRIMARY KEY (topic, owner, version, field)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dataset_versions (
      topic       TEXT NOT NULL,
      owner       TEXT NOT NULL,
      version     INTEGER NOT NULL,
      completedAt TEXT NOT NULL,
      PRIMARY KEY (topic, owner, version)
    )
  `)
}

function migrateToV8(db: Database) {
  const cols = db.query("PRAGMA table_info(sessions)").all() as { name: string; type: string }[]
  const idCol = cols.find(c => c.name === "id")
  if (!idCol || idCol.type.toUpperCase() === "TEXT") return

  db.exec(`
    CREATE TABLE sessions_v8 (
      id        TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      persona   TEXT NOT NULL,
      model     TEXT NOT NULL,
      title     TEXT NOT NULL,
      owner     TEXT,
      session   TEXT NOT NULL,
      events    TEXT NOT NULL
    )
  `)
  const rows = db.query("SELECT * FROM sessions").all() as {
    id: number
    createdAt: string
    updatedAt: string
    persona: string
    model: string
    title: string
    owner: string | null
    session: string
    events: string
  }[]
  const insert = db.query(`
    INSERT INTO sessions_v8 (id, createdAt, updatedAt, persona, model, title, owner, session, events)
    VALUES ($id, $createdAt, $updatedAt, $persona, $model, $title, $owner, $session, $events)
  `)
  db.transaction(() => {
    for (const row of rows) {
      insert.run({
        $id: Bun.randomUUIDv7(),
        $createdAt: row.createdAt,
        $updatedAt: row.updatedAt,
        $persona: row.persona,
        $model: row.model,
        $title: row.title,
        $owner: row.owner,
        $session: row.session,
        $events: row.events
      })
    }
  })()
  db.exec("DROP TABLE sessions")
  db.exec("ALTER TABLE sessions_v8 RENAME TO sessions")
}

function migrateSchema(db: Database, fromVersion: number) {
  if (fromVersion < 6) {
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN owner TEXT")
    } catch {}
  }
  if (fromVersion < 7) {
    try {
      db.exec("DROP TABLE IF EXISTS game_results")
    } catch {}
    try {
      db.exec("DROP TABLE IF EXISTS game_rounds")
    } catch {}
  }
  if (fromVersion < 8) migrateToV8(db)
  db.query("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION)
}

function openDb(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec("PRAGMA foreign_keys = ON")
  createSchema(db)
  const hasVersion = db.query("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null
  if (!hasVersion) db.query("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION)
  else if (hasVersion.version < SCHEMA_VERSION) migrateSchema(db, hasVersion.version)
  return db
}

type SessionRow = Omit<PersistedSession, "session" | "events"> & { session: string; events: string }
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

function noteParams(key: string, note: MemoryNote) {
  return {
    $key: key,
    $content: note.content,
    $importance: note.importance,
    $tags: JSON.stringify(note.tags),
    $sticky: note.sticky ? 1 : 0,
    $createdAt: note.createdAt,
    $lastUsedAt: note.lastUsedAt,
    $useCount: note.useCount
  }
}

/** Local CLI persistence: one sqlite file (sessions, notes, datasets). */
export function createSqliteStore(dbPath: string): NasiStore {
  const db = openDb(dbPath)

  return {
    async createSession(data: SessionWrite & { title: string }) {
      const now = new Date().toISOString()
      const id = Bun.randomUUIDv7()
      db.query(`
        INSERT INTO sessions (id, createdAt, updatedAt, persona, model, title, owner, session, events)
        VALUES ($id, $createdAt, $updatedAt, $persona, $model, $title, $owner, $session, $events)
      `).run({
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
    },

    async updateSession(id, data) {
      db.query(`
        UPDATE sessions
        SET updatedAt = $updatedAt, persona = $persona, model = $model, session = $session, events = $events
        WHERE id = $id
      `).run({
        $id: id,
        $updatedAt: new Date().toISOString(),
        $persona: data.persona,
        $model: data.model,
        $session: JSON.stringify(data.session),
        $events: JSON.stringify(data.events)
      })
    },

    async loadSession(id) {
      const row = db
        .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = $id`)
        .get({ $id: id }) as SessionRow | null
      return row ? rowToSession(row) : undefined
    },

    async loadLatestSession(owner) {
      const row =
        owner === null
          ? (db
              .query(
                `SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner IS NULL ORDER BY updatedAt DESC, id DESC LIMIT 1`
              )
              .get() as SessionRow | null)
          : (db
              .query(
                `SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner = $owner ORDER BY updatedAt DESC, id DESC LIMIT 1`
              )
              .get({ $owner: owner }) as SessionRow | null)
      return row ? rowToSession(row) : undefined
    },

    async deleteSession(id) {
      return db.query("DELETE FROM sessions WHERE id = $id").run({ $id: id }).changes > 0
    },

    async listSessions(): Promise<SessionMeta[]> {
      return db
        .query(
          "SELECT id, createdAt, updatedAt, persona, model, title, owner FROM sessions ORDER BY updatedAt DESC, id DESC"
        )
        .all() as SessionMeta[]
    },

    async loadPromptHistory(limit = 100) {
      const rows = db
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
    },

    async loadMemory() {
      const rows = db
        .query("SELECT key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount FROM notes")
        .all() as {
        key: string
        content: string
        importance: string
        tags: string
        sticky: number
        createdAt: string
        lastUsedAt: string
        useCount: number
      }[]
      const store: MemoryStore = {}
      for (const row of rows) {
        store[row.key] = {
          content: row.content,
          importance: row.importance as MemoryNote["importance"],
          tags: JSON.parse(row.tags),
          sticky: row.sticky === 1,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
          useCount: row.useCount
        }
      }
      return store
    },

    async saveMemory(store) {
      const insert = db.query(`
        INSERT INTO notes (key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount)
        VALUES ($key, $content, $importance, $tags, $sticky, $createdAt, $lastUsedAt, $useCount)
      `)
      const deleteAll = db.query("DELETE FROM notes")
      db.transaction(() => {
        deleteAll.run()
        for (const [key, note] of Object.entries(store)) insert.run(noteParams(key, note))
      })()
    },

    async latestDatasetVersion(topic, owner) {
      const row = db
        .query(
          `SELECT MAX(version) AS version FROM (
             SELECT version FROM dataset_answers WHERE topic = $topic AND owner = $owner
             UNION ALL
             SELECT version FROM dataset_versions WHERE topic = $topic AND owner = $owner
           )`
        )
        .get({ $topic: topic, $owner: ownerKey(owner) }) as { version: number | null } | null
      return row?.version ?? 0
    },

    async loadDatasetAnswers(topic, owner, version) {
      return db
        .query(
          `SELECT field, value, answeredAt FROM dataset_answers
           WHERE topic = $topic AND owner = $owner AND version = $version
           ORDER BY answeredAt ASC`
        )
        .all({ $topic: topic, $owner: ownerKey(owner), $version: version }) as {
        field: string
        value: string
        answeredAt: string
      }[]
    },

    async saveDatasetAnswer(topic, owner, version, field, value) {
      db.query(
        `INSERT INTO dataset_answers (topic, owner, version, field, value, answeredAt)
         VALUES ($topic, $owner, $version, $field, $value, $answeredAt)
         ON CONFLICT(topic, owner, version, field) DO UPDATE SET value = excluded.value, answeredAt = excluded.answeredAt`
      ).run({
        $topic: topic,
        $owner: ownerKey(owner),
        $version: version,
        $field: field,
        $value: value,
        $answeredAt: new Date().toISOString()
      })
    },

    async markDatasetVersionComplete(topic, owner, version) {
      db.query(
        `INSERT OR IGNORE INTO dataset_versions (topic, owner, version, completedAt)
         VALUES ($topic, $owner, $version, $completedAt)`
      ).run({
        $topic: topic,
        $owner: ownerKey(owner),
        $version: version,
        $completedAt: new Date().toISOString()
      })
    },

    async loadDatasetVersionCompletedAt(topic, owner, version) {
      const row = db
        .query(
          "SELECT completedAt FROM dataset_versions WHERE topic = $topic AND owner = $owner AND version = $version"
        )
        .get({ $topic: topic, $owner: ownerKey(owner), $version: version }) as { completedAt: string } | null
      return row?.completedAt
    },

    async listDatasetVersionsSummary() {
      const rows = db
        .query(
          `SELECT a.topic AS topic, a.owner AS owner, a.version AS version,
                  COUNT(*) AS answeredCount, v.completedAt AS completedAt
           FROM dataset_answers a
           LEFT JOIN dataset_versions v
             ON v.topic = a.topic AND v.owner = a.owner AND v.version = a.version
           GROUP BY a.topic, a.owner, a.version
           ORDER BY a.topic ASC, a.owner ASC, a.version ASC`
        )
        .all() as {
        topic: string
        owner: string
        version: number
        answeredCount: number
        completedAt: string | null
      }[]
      return rows.map(row => ({
        ...row,
        owner: ownerOf(row.owner),
        completedAt: row.completedAt ?? undefined
      }))
    },

    async listAllDatasetAnswers() {
      const rows = db
        .query(
          `SELECT topic, owner, version, field, value, answeredAt FROM dataset_answers
           ORDER BY topic ASC, owner ASC, version ASC, answeredAt ASC`
        )
        .all() as {
        topic: string
        owner: string
        version: number
        field: string
        value: string
        answeredAt: string
      }[]
      return rows.map(row => ({ ...row, owner: ownerOf(row.owner) }))
    }
  }
}
