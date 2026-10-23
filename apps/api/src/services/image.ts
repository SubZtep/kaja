import {
  bumpDescribeAttempt,
  describeImage,
  type Describer,
  imageDataUrl,
  imageKey,
  recordDescribeCall,
  recordDescribedImage,
  sessionImagePrefix
} from "@kaja/nasi"
import type {
  AdminImage,
  AdminImagesQuery,
  DescribeImagesRequest,
  ImageOrphanKind,
  ImageOrphansResponse,
  StatsChannel
} from "@kaja/schema/api"
import type { Pool } from "pg"
// The describe writes are nasi's shared ones, on the Bun.SQL client; the rest of the service is still on the pool
import { sql } from "../core/db"
import { imageUrl, listObjects, objects } from "../core/files"

/** A page of the admin images list. */
export const IMAGES_PAGE = 48

/** The SQL for a `source_url` column's host, lowercased and without `www.`; null when it isn't an http(s) URL. */
export const sourceHost = (column: string) =>
  String.raw`regexp_replace(lower(substring(${column} FROM '^https?://([^/:?#]+)')), '^www\.', '')`

type ImageListRow = {
  id: string
  session_id: string
  user_id: string
  email: string
  name: string
  session_title: string | null
  channel: StatsChannel | null
  mime_type: string
  width: number
  height: number
  bytes: number
  source_url: string | null
  alt: string | null
  title: string | null
  file_name: string | null
  description: string | null
  description_model: string | null
  described_at: Date | null
  created_at: Date
  // Postgres' own text of created_at: a Date would lose its microseconds, and the cursor would skip rows
  created_text: string
}

type Cursor = [createdAt: string, sessionId: string, id: string]

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url")

function decodeCursor(text: string): Cursor | undefined {
  try {
    const cursor: unknown = JSON.parse(Buffer.from(text, "base64url").toString())
    return Array.isArray(cursor) && cursor.length === 3 && cursor.every(part => typeof part === "string")
      ? (cursor as Cursor)
      : undefined
  } catch {
    return undefined
  }
}

/** A cursor that isn't one this service handed out. */
export class BadCursorError extends Error {}

/** The sweep gives an image up after this many tries; the admin's buttons still try it. */
export const MAX_DESCRIBE_ATTEMPTS = 3
/** Images one sweep describes at most. */
export const SWEEP_BATCH = 20
/** A sweep leaves images this young to the turn that stored them, which is still describing them. */
export const SWEEP_MIN_AGE_MS = 10 * 60 * 1000
/** Most images "describe all matching" queues at once. */
const MAX_QUEUED = 1000
/** Vision model calls running at once, per sweep or queue. */
const DESCRIBE_CONCURRENCY = 3
/** Object existence checks running at once during a scan. */
const CHECK_CONCURRENCY = 8
/** Orphans this young are left alone: an object may still be getting its row, a row its object. */
const ORPHAN_GRACE_MS = 60 * 60 * 1000
/** An image whose session still doesn't exist after this long belongs to a turn that never saved. */
const UNSAVED_AFTER_MS = 24 * 60 * 60 * 1000
const MAX_EXAMPLES = 50

/** Runs `run` over `items`, at most `limit` at a time. */
async function eachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await run(items[next++]!)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

type Filters = Omit<AdminImagesQuery, "cursor">

// The list's filters as SQL over `nasi_image i`, adding their values to `param`
function filterSql(filters: Filters, param: (value: unknown) => string): string[] {
  const where: string[] = []
  if (filters.user) where.push(`i.user_id = ${param(filters.user)}`)
  if (filters.site) where.push(`${sourceHost("i.source_url")} = ${param(filters.site.replace(/^www\./, ""))}`)
  if (filters.undescribed !== undefined) where.push(`i.description IS ${filters.undescribed ? "" : "NOT "}NULL`)
  if (filters.origin === "url") where.push("i.source_url IS NOT NULL")
  if (filters.origin === "file") where.push("i.file_name IS NOT NULL")
  if (filters.origin === "none") where.push("i.source_url IS NULL AND i.file_name IS NULL")
  return where
}

type ImageRef = { userId: string; sessionId: string; id: string }

const keyOf = (image: ImageRef) => imageKey(sessionImagePrefix(image.sessionId, image.userId), image.id)

/** `images/<userId>/<sessionId>/<id>` back to its parts; undefined for any other key. */
function refOf(key: string): ImageRef | undefined {
  const match = /^images\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{16})$/.exec(key)
  return match ? { userId: match[1]!, sessionId: match[2]!, id: match[3]! } : undefined
}

/**
 * Stored images across users, for admins: listed newest first and filtered, removed one at a time, described when
 * they have no description, and their orphans found and removed.
 */
export class ImageService {
  readonly #db: Pool
  // One instance runs the API, so this is every description being written, by image
  readonly #describing = new Map<string, Promise<string | undefined>>()
  readonly #orphanGraceMs: number

  /** `orphanGraceMs`: how young an orphan is still left alone (an hour; tests set less, the bucket can't backdate). */
  constructor(db: Pool, opts: { orphanGraceMs?: number } = {}) {
    this.#db = db
    this.#orphanGraceMs = opts.orphanGraceMs ?? ORPHAN_GRACE_MS
  }

  /** One page of images matching every filter given; `next` is the cursor for the page after it. */
  async list(query: AdminImagesQuery): Promise<{ images: AdminImage[]; next: string | null }> {
    const params: unknown[] = []
    const param = (value: unknown) => `$${params.push(value)}`
    const where = filterSql(query, param)
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor)
      if (!cursor) throw new BadCursorError("Not a cursor from this list")
      where.push(
        `(i.created_at, i.session_id, i.id) < (${param(cursor[0])}::timestamptz, ${param(cursor[1])}::uuid, ${param(cursor[2])})`
      )
    }
    const { rows } = await this.#db.query<ImageListRow>(
      `
      SELECT i.id, i.session_id, i.user_id, u.email, u.name, s.title AS session_title, s.channel,
        i.mime_type, i.width, i.height, i.bytes, i.source_url, i.alt, i.title, i.file_name,
        i.description, i.description_model, i.described_at, i.created_at, i.created_at::text AS created_text
      FROM nasi_image i
      JOIN "user" u ON u.id = i.user_id
      LEFT JOIN nasi_session s ON s.id = i.session_id AND s.user_id = i.user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY i.created_at DESC, i.session_id DESC, i.id DESC
      LIMIT ${param(IMAGES_PAGE + 1)}
      `,
      params
    )
    const page = rows.slice(0, IMAGES_PAGE)
    const last = page.at(-1)
    return {
      images: page.map(row => this.#rowToImage(row)),
      next: rows.length > IMAGES_PAGE && last ? encodeCursor([last.created_text, last.session_id, last.id]) : null
    }
  }

  /** Whether the image has a row. */
  async exists(sessionId: string, id: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT 1 FROM nasi_image WHERE session_id = $1 AND id = $2", [sessionId, id])
    return rows.length > 0
  }

  /** Removes one image, its object first and then its row; the owner's id, or undefined when there's no such image. */
  async remove(sessionId: string, id: string): Promise<{ userId: string } | undefined> {
    const { rows } = await this.#db.query<{ user_id: string }>(
      "SELECT user_id FROM nasi_image WHERE session_id = $1 AND id = $2",
      [sessionId, id]
    )
    const userId = rows[0]?.user_id
    if (!userId) return undefined
    await objects.delete(keyOf({ userId, sessionId, id }))
    await this.#db.query("DELETE FROM nasi_image WHERE session_id = $1 AND id = $2", [sessionId, id])
    return { userId }
  }

  /**
   * Has the vision model describe one image, whatever its tries so far, and keeps the description: in the row, in its
   * saved messages' labels, and as a model call of its saved session. Undefined when there's no such image or the
   * model gave nothing back; a failed call is counted as a try and thrown.
   */
  describe(sessionId: string, id: string, describer: Describer): Promise<string | undefined> {
    const key = `${sessionId}/${id}`
    const running = this.#describing.get(key)
    if (running) return running
    const done = this.#describeOnce(sessionId, id, describer).finally(() => this.#describing.delete(key))
    this.#describing.set(key, done)
    return done
  }

  /** The hourly sweep: describes up to {@link SWEEP_BATCH} of the oldest images still without a description. */
  async sweep(describer: Describer): Promise<{ described: number; failed: number }> {
    const { rows } = await this.#db.query<{ session_id: string; id: string }>(
      `SELECT session_id, id FROM nasi_image
       WHERE description IS NULL AND describe_attempts < $1 AND created_at < now() - $2 * interval '1 millisecond'
       ORDER BY created_at LIMIT $3`,
      [MAX_DESCRIBE_ATTEMPTS, SWEEP_MIN_AGE_MS, SWEEP_BATCH]
    )
    const counts = { described: 0, failed: 0 }
    await eachLimited(rows, DESCRIBE_CONCURRENCY, async row => {
      try {
        if (await this.describe(row.session_id, row.id, describer)) counts.described++
        else counts.failed++
      } catch (error) {
        counts.failed++
        console.warn("The sweep couldn't describe an image", { sessionId: row.session_id, id: row.id, error })
      }
    })
    return counts
  }

  /** Queues every undescribed image matching `filters` (at most 1000) to be described in the background. */
  async describeMatching(filters: DescribeImagesRequest, describer: Describer): Promise<number> {
    const params: unknown[] = []
    const param = (value: unknown) => `$${params.push(value)}`
    const where = filterSql({ ...filters, undescribed: true }, param)
    const { rows } = await this.#db.query<{ session_id: string; id: string }>(
      `SELECT i.session_id, i.id FROM nasi_image i WHERE ${where.join(" AND ")} ORDER BY i.created_at LIMIT ${param(MAX_QUEUED)}`,
      params
    )
    const queued = rows.filter(row => !this.#describing.has(`${row.session_id}/${row.id}`))
    void eachLimited(queued, DESCRIBE_CONCURRENCY, async row => {
      await this.describe(row.session_id, row.id, describer).catch((error: unknown) =>
        console.warn("A queued image couldn't be described", { sessionId: row.session_id, id: row.id, error })
      )
    })
    return queued.length
  }

  async #describeOnce(sessionId: string, id: string, describer: Describer): Promise<string | undefined> {
    const { rows } = await this.#db.query<{ user_id: string; mime_type: string; width: number; height: number }>(
      "SELECT user_id, mime_type, width, height FROM nasi_image WHERE session_id = $1 AND id = $2",
      [sessionId, id]
    )
    const row = rows[0]
    if (!row) return undefined
    const tried = () => bumpDescribeAttempt(sql, row.user_id, sessionId, id)
    const data = await objects.get(keyOf({ userId: row.user_id, sessionId, id }))
    if (!data) {
      await tried()
      return undefined
    }
    let usage: Parameters<typeof recordDescribeCall>[3] | undefined
    let text: string | undefined
    try {
      text = await describeImage(describer, imageDataUrl({ data, mimeType: row.mime_type }), call => {
        usage = call
      })
    } finally {
      await tried()
      if (usage) await recordDescribeCall(sql, row.user_id, sessionId, usage)
    }
    if (!text) return undefined
    const image = { sessionId, id, width: row.width, height: row.height }
    await recordDescribedImage(sql, row.user_id, image, text, describer.model)
    return text
  }

  /** What the scan finds of each orphan kind right now (see {@link ImageOrphanKind}). */
  async orphans(): Promise<ImageOrphansResponse> {
    const [objectsLeft, rowsLeft, unsaved] = await Promise.all([
      this.#orphanObjects(),
      this.#orphanRows(),
      this.#unsaved()
    ])
    const summary = (items: { key: string; bytes: number }[]) => ({
      count: items.length,
      bytes: items.reduce((sum, item) => sum + item.bytes, 0),
      examples: items.slice(0, MAX_EXAMPLES).map(item => item.key)
    })
    return { objects: summary(objectsLeft), rows: summary(rowsLeft), unsaved: summary(unsaved) }
  }

  /** Removes one orphan kind, scanned again now; each is checked again, and anything younger than an hour stays. */
  async removeOrphans(kind: ImageOrphanKind): Promise<number> {
    const settled = Date.now() - this.#orphanGraceMs
    let removed = 0
    if (kind === "objects") {
      const found = (await this.#orphanObjects()).filter(item => item.modified.getTime() < settled)
      await eachLimited(found, CHECK_CONCURRENCY, async item => {
        const ref = refOf(item.key)
        if (ref && (await this.#hasRow(ref))) return
        await objects.delete(item.key)
        removed++
      })
    } else if (kind === "rows") {
      const found = (await this.#orphanRows()).filter(item => item.created.getTime() < settled)
      await eachLimited(found, CHECK_CONCURRENCY, async item => {
        if (await objects.exists(item.key)) return
        const result = await this.#db.query("DELETE FROM nasi_image WHERE session_id = $1 AND id = $2", [
          item.sessionId,
          item.id
        ])
        removed += result.rowCount ?? 0
      })
    } else {
      const sessions = new Map((await this.#unsaved()).map(item => [`${item.userId}/${item.sessionId}`, item]))
      await eachLimited([...sessions.values()], CHECK_CONCURRENCY, async ({ userId, sessionId }) => {
        const { rows } = await this.#db.query("SELECT 1 FROM nasi_session WHERE id = $1", [sessionId])
        if (rows.length) return
        await objects.deletePrefix(`${sessionImagePrefix(sessionId, userId)}/`)
        const result = await this.#db.query("DELETE FROM nasi_image WHERE session_id = $1 AND user_id = $2", [
          sessionId,
          userId
        ])
        removed += result.rowCount ?? 0
      })
    }
    return removed
  }

  async #hasRow(ref: ImageRef): Promise<boolean> {
    const { rows } = await this.#db.query(
      "SELECT 1 FROM nasi_image WHERE user_id = $1 AND session_id = $2 AND id = $3",
      [ref.userId, ref.sessionId, ref.id]
    )
    return rows.length > 0
  }

  // Objects under images/ that no row describes (a leftover <key>.json from before the table isn't one)
  async #orphanObjects(): Promise<{ key: string; bytes: number; modified: Date }[]> {
    const { rows } = await this.#db.query<{ user_id: string; session_id: string; id: string }>(
      "SELECT user_id, session_id, id FROM nasi_image"
    )
    const known = new Set(rows.map(row => keyOf({ userId: row.user_id, sessionId: row.session_id, id: row.id })))
    const found: { key: string; bytes: number; modified: Date }[] = []
    for await (const object of listObjects("images/"))
      if (!object.key.endsWith(".json") && !known.has(object.key))
        found.push({ key: object.key, bytes: object.size, modified: object.modified })
    return found
  }

  // Rows whose object is gone; the never-saved sessions' rows are their own kind
  async #orphanRows(): Promise<(ImageRef & { key: string; bytes: number; created: Date })[]> {
    const { rows } = await this.#db.query<{
      user_id: string
      session_id: string
      id: string
      bytes: number
      created_at: Date
    }>(
      `SELECT i.user_id, i.session_id, i.id, i.bytes, i.created_at FROM nasi_image i
       WHERE EXISTS (SELECT 1 FROM nasi_session s WHERE s.id = i.session_id)
          OR i.created_at >= now() - $1 * interval '1 millisecond'`,
      [UNSAVED_AFTER_MS]
    )
    const missing: (ImageRef & { key: string; bytes: number; created: Date })[] = []
    await eachLimited(rows, CHECK_CONCURRENCY, async row => {
      const ref = { userId: row.user_id, sessionId: row.session_id, id: row.id }
      const key = keyOf(ref)
      if (!(await objects.exists(key))) missing.push({ ...ref, key, bytes: row.bytes, created: row.created_at })
    })
    return missing
  }

  // Images of sessions that still don't exist a day on: a turn that crashed before its first save
  async #unsaved(): Promise<(ImageRef & { key: string; bytes: number })[]> {
    const { rows } = await this.#db.query<{ user_id: string; session_id: string; id: string; bytes: number }>(
      `SELECT i.user_id, i.session_id, i.id, i.bytes FROM nasi_image i
       WHERE NOT EXISTS (SELECT 1 FROM nasi_session s WHERE s.id = i.session_id)
         AND i.created_at < now() - $1 * interval '1 millisecond'
       ORDER BY i.created_at`,
      [UNSAVED_AFTER_MS]
    )
    return rows.map(row => {
      const ref = { userId: row.user_id, sessionId: row.session_id, id: row.id }
      return { ...ref, key: keyOf(ref), bytes: row.bytes }
    })
  }

  #rowToImage(row: ImageListRow): AdminImage {
    const source = Object.fromEntries(
      Object.entries({ url: row.source_url, alt: row.alt, title: row.title, fileName: row.file_name }).filter(
        ([, value]) => value !== null
      )
    )
    return {
      id: row.id,
      sessionId: row.session_id,
      session: row.session_title !== null && row.channel ? { title: row.session_title, channel: row.channel } : null,
      user: { id: row.user_id, email: row.email, name: row.name },
      url: imageUrl(keyOf({ userId: row.user_id, sessionId: row.session_id, id: row.id })),
      mimeType: row.mime_type,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      source,
      description: row.description,
      descriptionModel: row.description_model,
      describedAt: row.described_at,
      createdAt: row.created_at
    }
  }
}
