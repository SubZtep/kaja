import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import type { MemoryNote, MemoryStore } from "@kaja/schema/store"
import { file, write } from "bun"
import { getConfigPath, invalidateConfigCache, readConfigLoose } from "../config/config"
import { getPaths } from "../paths"

// Computed fresh per call, not cached — tests mutate XDG_DATA_HOME per spec file.
export function getDefaultMemoryDbPath() {
  return join(getPaths().data, "memory.sqlite")
}

/** Resolves the DB path: config.memory.dbPath, or the default XDG location. Uses readConfigLoose so this works even without a valid settings.json. */
export async function resolveMemoryDbPath(): Promise<string> {
  const loose = await readConfigLoose()
  return loose.memory?.dbPath || getDefaultMemoryDbPath()
}

/** Persists a working dbPath into settings.json's memory.dbPath if unset; no-op if settings.json is missing or already set. Best-effort — errors are swallowed. */
async function persistDbPathIfMissing(dbPath: string) {
  try {
    const configPath = getConfigPath()
    if (!(await file(configPath).exists())) return
    const loose = await readConfigLoose()
    if (loose.memory?.dbPath) return
    await write(file(configPath), JSON.stringify({ ...loose, memory: { ...loose.memory, dbPath } }, null, 2))
    invalidateConfigCache()
  } catch {}
}

const SCHEMA_VERSION = 7

const INSERT_NOTE_SQL = `
  INSERT INTO notes (key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount)
  VALUES ($key, $content, $importance, $tags, $sticky, $createdAt, $lastUsedAt, $useCount)
`

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
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      persona   TEXT NOT NULL,
      model     TEXT NOT NULL,
      title     TEXT NOT NULL,
      owner     TEXT,           -- NULL = terminal session; 'telegram:<id>' otherwise
      session   TEXT NOT NULL,  -- JSON: lib/agents.ts Session
      events    TEXT NOT NULL   -- JSON: hooks/use-agent.ts TimelineEvent[]
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS dataset_answers (
      topic      TEXT NOT NULL,
      -- '' = terminal session; 'telegram:<id>' otherwise. NOT NULL so PRIMARY KEY
      -- uniqueness works (NULL != NULL in SQLite); ownerKey()/ownerOf() translate at the edges.
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

/** Migrates an existing database from `fromVersion` up to {@link SCHEMA_VERSION}. */
function migrateSchema(db: Database, fromVersion: number) {
  // v5 -> v6: sessions gains `owner` (NULL = terminal) so Telegram users each
  // resume their own last session. No ADD COLUMN IF NOT EXISTS in SQLite, so guard with try/catch.
  if (fromVersion < 6) {
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN owner TEXT")
    } catch {}
  }
  // v6 -> v7: replaces the like-or-not game tables with the dataset info collector.
  if (fromVersion < 7) {
    try {
      db.exec("DROP TABLE IF EXISTS game_results")
    } catch {}
    try {
      db.exec("DROP TABLE IF EXISTS game_rounds")
    } catch {}
  }
  db.query("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION)
}

let db: Database | undefined
let dbPathInUse: string | undefined

/**
 * Opens (creating if needed) the memory database. Cached module-wide, keyed
 * by resolved path — reopens if the path changes (only happens across tests).
 * Also the shared seam for lib/session-store.ts, which lives in the same file.
 */
export async function getDb(): Promise<Database> {
  const dbPath = await resolveMemoryDbPath()
  if (db && dbPathInUse === dbPath) return db

  db?.close()
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath, { create: true })
  dbPathInUse = dbPath
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL") // safe pairing w/ WAL, faster than FULL
  db.exec("PRAGMA busy_timeout = 5000") // wait up to 5s on lock instead of throwing
  createSchema(db)

  const hasVersion = db.query("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null
  if (!hasVersion) {
    db.query("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION)
  } else if (hasVersion.version < SCHEMA_VERSION) {
    migrateSchema(db, hasVersion.version)
  }

  // Only persist the path back to settings.json once we know it works — the
  // database above opened and initialized without throwing.
  await persistDbPathIfMissing(dbPath)

  return db
}

/** One-line note header shared by the memory tools and `kaja memory` CLI: `user:who-they-are [high, sticky] (tags: user, kaja) (used 2026-07-18)` */
export function noteHeader(key: string, note: MemoryNote) {
  const flags = note.sticky ? `${note.importance}, sticky` : note.importance
  const tags = note.tags.length > 0 ? ` (tags: ${note.tags.join(", ")})` : ""
  return `${key} [${flags}]${tags} (used ${note.lastUsedAt.slice(0, 10)})`
}

/**
 * Deletes notes from a store in place by exact key, by tag, or by key glob
 * pattern, returning the deleted keys (without saving — callers decide).
 */
export function forgetNotes(store: MemoryStore, selector: { key?: string; tag?: string; pattern?: string }): string[] {
  let victims: string[]
  if (selector.key !== undefined) {
    victims = selector.key in store ? [selector.key] : []
  } else if (selector.tag !== undefined) {
    victims = Object.entries(store)
      .filter(([, note]) => note.tags.includes(selector.tag!))
      .map(([key]) => key)
  } else if (selector.pattern !== undefined) {
    const glob = new Bun.Glob(selector.pattern)
    victims = Object.keys(store).filter(key => glob.match(key))
  } else {
    victims = []
  }
  for (const key of victims) delete store[key]
  return victims
}

function rowToNote(row: {
  content: string
  importance: string
  tags: string
  sticky: number
  createdAt: string
  lastUsedAt: string
  useCount: number
}): MemoryNote {
  return {
    content: row.content,
    importance: row.importance as MemoryNote["importance"],
    tags: JSON.parse(row.tags),
    sticky: row.sticky === 1,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount
  }
}

export async function loadMemory(): Promise<MemoryStore> {
  const database = await getDb()
  const rows = database
    .query("SELECT key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount FROM notes")
    .all() as ({ key: string } & Parameters<typeof rowToNote>[0])[]

  const store: MemoryStore = {}
  for (const row of rows) store[row.key] = rowToNote(row)
  return store
}

export async function saveMemory(store: MemoryStore) {
  const database = await getDb()

  const deleteAll = database.query("DELETE FROM notes")
  const insert = database.query(INSERT_NOTE_SQL)

  database.transaction(() => {
    deleteAll.run()
    for (const [key, note] of Object.entries(store)) insert.run(noteParams(key, note))
  })()
}

export type DatasetAnswer = {
  field: string
  value: string
  answeredAt: string
}

// dataset tables store owner as NOT NULL ('' = terminal); these translate to/from string | null at the boundary.
function ownerKey(owner: string | null): string {
  return owner ?? ""
}
function ownerOf(key: string): string | null {
  return key === "" ? null : key
}

/** Latest version number for (topic, owner), across answers and completions. Returns 0 if none started. */
export async function latestDatasetVersion(topic: string, owner: string | null): Promise<number> {
  const database = await getDb()
  const row = database
    .query(
      `SELECT MAX(version) AS version FROM (
         SELECT version FROM dataset_answers WHERE topic = $topic AND owner = $owner
         UNION ALL
         SELECT version FROM dataset_versions WHERE topic = $topic AND owner = $owner
       )`
    )
    .get({ $topic: topic, $owner: ownerKey(owner) }) as {
    version: number | null
  } | null
  return row?.version ?? 0
}

export async function loadDatasetAnswers(
  topic: string,
  owner: string | null,
  version: number
): Promise<DatasetAnswer[]> {
  const database = await getDb()
  return database
    .query(
      `SELECT field, value, answeredAt FROM dataset_answers
       WHERE topic = $topic AND owner = $owner AND version = $version
       ORDER BY answeredAt ASC`
    )
    .all({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version
    }) as DatasetAnswer[]
}

/** Upserts one field's answer for (topic, owner, version). */
export async function saveDatasetAnswer(
  topic: string,
  owner: string | null,
  version: number,
  field: string,
  value: string
): Promise<void> {
  const database = await getDb()
  database
    .query(
      `INSERT INTO dataset_answers (topic, owner, version, field, value, answeredAt)
       VALUES ($topic, $owner, $version, $field, $value, $answeredAt)
       ON CONFLICT(topic, owner, version, field) DO UPDATE SET value = excluded.value, answeredAt = excluded.answeredAt`
    )
    .run({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version,
      $field: field,
      $value: value,
      $answeredAt: new Date().toISOString()
    })
}

/** Records completion time for (topic, owner, version). No-op if already recorded (INSERT OR IGNORE). */
export async function markDatasetVersionComplete(topic: string, owner: string | null, version: number): Promise<void> {
  const database = await getDb()
  database
    .query(
      `INSERT OR IGNORE INTO dataset_versions (topic, owner, version, completedAt)
       VALUES ($topic, $owner, $version, $completedAt)`
    )
    .run({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version,
      $completedAt: new Date().toISOString()
    })
}

export async function loadDatasetVersionCompletedAt(
  topic: string,
  owner: string | null,
  version: number
): Promise<string | undefined> {
  const database = await getDb()
  const row = database
    .query("SELECT completedAt FROM dataset_versions WHERE topic = $topic AND owner = $owner AND version = $version")
    .get({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version
    }) as { completedAt: string } | null
  return row?.completedAt
}

/** Every (topic, owner, version) with an answer, plus answered-field count and completion time — for the `kaja web` browser. */
export async function listDatasetVersionsSummary(): Promise<
  {
    topic: string
    owner: string | null
    version: number
    answeredCount: number
    completedAt: string | undefined
  }[]
> {
  const database = await getDb()
  const rows = database
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
}

/** All answers across every (topic, owner, version) — for the `kaja web` browser. */
export async function listAllDatasetAnswers(): Promise<
  (DatasetAnswer & { topic: string; owner: string | null; version: number })[]
> {
  const database = await getDb()
  const rows = database
    .query(
      `SELECT topic, owner, version, field, value, answeredAt FROM dataset_answers
       ORDER BY topic ASC, owner ASC, version ASC, answeredAt ASC`
    )
    .all() as (DatasetAnswer & {
    topic: string
    owner: string
    version: number
  })[]
  return rows.map(row => ({ ...row, owner: ownerOf(row.owner) }))
}
