import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  createSqlStore,
  folderObjects,
  LOCAL_USER_ID,
  type NasiStore,
  sessionImagePrefix,
  SQLITE_SCHEMA
} from "@kaja/nasi"
import { SQL } from "bun"
import { log } from "../logger"

/** The store's SQLite file, opened with foreign keys on and its schema in place. */
export async function openLocalDb(dbPath: string): Promise<SQL> {
  mkdirSync(dirname(dbPath), { recursive: true })
  const sql = new SQL({ adapter: "sqlite", filename: dbPath, strict: true })
  await sql`PRAGMA journal_mode = WAL`
  await sql`PRAGMA synchronous = NORMAL`
  await sql`PRAGMA busy_timeout = 5000`
  await sql`PRAGMA foreign_keys = ON`
  await sql.unsafe(SQLITE_SCHEMA)
  return sql
}

/** The folder the session images are kept in, beside the database. */
export const imagesRoot = (dbPath: string) => join(dirname(dbPath), "files")

// A saved timeline keeps a stored tool image by its object key; the path it was shown from is worked out again on load
function storedEvent(event: unknown): unknown {
  const image = event as { type?: string; key?: string; path?: string }
  if (image.type !== "tool_image" || !image.key) return event
  const { path: _path, ...kept } = image
  return kept
}

/** Local CLI persistence: one SQLite file (sessions, notes, datasets), and the session images as files beside it. */
export async function createSqliteStore(dbPath: string): Promise<NasiStore> {
  const sql = await openLocalDb(dbPath)
  const filesRoot = imagesRoot(dbPath)
  return createSqlStore(sql, {
    userId: LOCAL_USER_ID,
    defaultChannel: "local",
    objects: folderObjects(filesRoot),
    // One user, so no user folder: files/images/<sessionId>/<id>
    imagePrefix: sessionId => sessionImagePrefix(sessionId),
    mapEventOut: storedEvent,
    mapEventIn(event) {
      const image = event as { type?: string; key?: string }
      if (image.type !== "tool_image" || !image.key) return event
      return { ...image, path: join(filesRoot, image.key) }
    },
    onInvalid: (sessionId, error) => log.error("Stored session failed validation", { sessionId, error })
  })
}
