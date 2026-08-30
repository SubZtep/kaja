import { Database } from "bun:sqlite"
import { AsyncLocalStorage } from "node:async_hooks"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export const SCHEMA_VERSION = 8

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
  db.exec(`
    CREATE INDEX IF NOT EXISTS sessions_updatedAt_idx ON sessions (updatedAt DESC)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS sessions_owner_updatedAt_idx ON sessions (owner, updatedAt DESC)
  `)
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
  if (fromVersion < 8) {
    migrateToV8(db)
  }
  db.query("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION)
}

const openDbs = new Map<string, Database>()

/** Opens (creating if needed) a nasi sqlite file. Cached per path. */
export function openStore(dbPath: string): Database {
  const existing = openDbs.get(dbPath)
  if (existing) return existing

  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath, { create: true })
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA busy_timeout = 5000")
  db.exec("PRAGMA foreign_keys = ON")
  createSchema(db)

  const hasVersion = db.query("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null
  if (!hasVersion) {
    db.query("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION)
  } else if (hasVersion.version < SCHEMA_VERSION) {
    migrateSchema(db, hasVersion.version)
  }

  openDbs.set(dbPath, db)
  return db
}

export function closeStore(dbPath: string) {
  const db = openDbs.get(dbPath)
  if (!db) return
  db.close()
  openDbs.delete(dbPath)
}

let defaultPath: string | undefined
const activePathStorage = new AsyncLocalStorage<string>()

/**
 * Sets the default store path used outside a {@link withStorePath} scope
 * (single-user CLI host). Hosted callers must not rely on this — concurrent
 * requests for different users would race on the same mutable default; use
 * {@link withStorePath} to scope the path to one request's async call chain.
 */
export function setActiveStorePath(dbPath: string) {
  defaultPath = dbPath
  openStore(dbPath)
}

/** Runs `fn` with `dbPath` as the active store path for its entire async call chain, isolated from concurrent calls with a different path. */
export function withStorePath<T>(dbPath: string, fn: () => Promise<T>): Promise<T> {
  openStore(dbPath)
  return activePathStorage.run(dbPath, fn)
}

export function getDb(): Database {
  const activePath = activePathStorage.getStore() ?? defaultPath
  if (!activePath) throw new Error("nasi store is not open — call setActiveStorePath() or openStore()")
  return openStore(activePath)
}

export function getActiveStorePath(): string | undefined {
  return activePathStorage.getStore() ?? defaultPath
}
