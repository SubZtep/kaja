import { readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import {
  bumpDescribeAttempt,
  describeImage,
  type Describer,
  imageDataUrl,
  LOCAL_USER_ID,
  recordDescribeCall,
  recordDescribedImage
} from "@kaja/nasi"
import type { SQL } from "bun"
import { siteOf } from "../image/source"

/** `kaja images describe` gives an image up after this many tries, unless it's run with `--retry`. */
export const MAX_DESCRIBE_ATTEMPTS = 3
/** Vision model calls running at once. */
export const DESCRIBE_CONCURRENCY = 3
/** Orphans this young are left alone: a file may still be getting its row, a row its file. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000
/** An image whose session still doesn't exist after this long belongs to a turn that never saved. */
const UNSAVED_AFTER_MS = 24 * 60 * 60 * 1000
const TOP = 5
const MAX_EXAMPLES = 10

export type LocalImageStats = {
  count: number
  bytes: number
  described: number
  undescribed: number
  sites: { host: string; images: number }[]
  sessions: { id: string; title: string; images: number; bytes: number }[]
}

/** What the local store keeps of its images: counts, size, the sites most came from, the sessions holding the most. */
export async function localImageStats(sql: SQL): Promise<LocalImageStats> {
  const [totals] = await sql<{ count: number; bytes: number; described: number }[]>`
    SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes, COUNT(description) AS described FROM nasi_image`
  const urls = await sql<{ source_url: string }[]>`SELECT source_url FROM nasi_image WHERE source_url IS NOT NULL`
  const perSite = new Map<string, number>()
  for (const { source_url } of urls) {
    const host = siteOf(source_url)
    if (host) perSite.set(host, (perSite.get(host) ?? 0) + 1)
  }
  // Only saved sessions: a new session's images arrive before its first save
  const sessions = await sql<LocalImageStats["sessions"]>`
    SELECT s.id AS id, s.title AS title, COUNT(*) AS images, SUM(i.bytes) AS bytes
    FROM nasi_image i JOIN nasi_session s ON s.id = i.session_id
    GROUP BY s.id ORDER BY bytes DESC, s.id LIMIT ${TOP}`
  return {
    ...totals!,
    undescribed: totals!.count - totals!.described,
    sites: [...perSite]
      .map(([host, images]) => ({ host, images }))
      .toSorted((a, b) => b.images - a.images || a.host.localeCompare(b.host))
      .slice(0, TOP),
    sessions: [...sessions]
  }
}

export type LocalImage = { sessionId: string; id: string; mimeType: string; width: number; height: number }

/** Images still without a description, oldest first; ones given up on only with `retry`. */
export async function imagesToDescribe(sql: SQL, retry: boolean): Promise<LocalImage[]> {
  return [
    ...(await sql<LocalImage[]>`
      SELECT session_id AS "sessionId", id, mime_type AS "mimeType", width, height FROM nasi_image
      WHERE description IS NULL ${retry ? sql`` : sql`AND describe_attempts < ${MAX_DESCRIBE_ATTEMPTS}`}
      ORDER BY created_at`)
  ]
}

const imagePath = (filesRoot: string, sessionId: string, id: string) => join(filesRoot, "images", sessionId, id)

/**
 * Has the vision model describe one image and keeps the description: in the row, in its saved messages' labels, and
 * as a model call of its saved session. Undefined when its file is gone or the model gave nothing back; a failed call
 * is counted as a try and thrown.
 */
export async function describeLocalImage(
  sql: SQL,
  filesRoot: string,
  describer: Describer,
  image: LocalImage
): Promise<string | undefined> {
  const tried = () => bumpDescribeAttempt(sql, LOCAL_USER_ID, image.sessionId, image.id)
  const file = Bun.file(imagePath(filesRoot, image.sessionId, image.id))
  if (!(await file.exists())) {
    await tried()
    return undefined
  }
  const data = new Uint8Array(await file.arrayBuffer())
  let usage: Parameters<typeof recordDescribeCall>[3] | undefined
  let text: string | undefined
  try {
    text = await describeImage(describer, imageDataUrl({ data, mimeType: image.mimeType }), call => {
      usage = call
    })
  } finally {
    await tried()
    if (usage) await recordDescribeCall(sql, LOCAL_USER_ID, image.sessionId, usage)
  }
  if (!text) return undefined
  await recordDescribedImage(sql, LOCAL_USER_ID, image, text, describer.model)
  return text
}

/** Orphan kinds: files with no row, rows whose file is gone, and images of sessions never saved (over a day ago). */
export type OrphanKind = "files" | "rows" | "unsaved"

type Orphan = { path: string; bytes: number; at: Date; sessionId: string; id?: string }

export type Orphans = Record<OrphanKind, { count: number; bytes: number; examples: string[]; items: Orphan[] }>

// Every stored file under files/images/<sessionId>/<id> (a leftover <id>.json from before the table isn't an image)
async function storedFiles(filesRoot: string): Promise<Orphan[]> {
  const root = join(filesRoot, "images")
  const sessions = await readdir(root).catch(() => [] as string[])
  const inSession = async (sessionId: string) => {
    const names = await readdir(join(root, sessionId)).catch(() => [] as string[])
    const files = await Promise.all(
      names
        .filter(name => !name.endsWith(".json"))
        .map(async (name): Promise<Orphan | undefined> => {
          const path = join(root, sessionId, name)
          const info = await stat(path).catch(() => undefined)
          return info?.isFile() ? { path, bytes: info.size, at: info.mtime, sessionId, id: name } : undefined
        })
    )
    return files.filter(file => file !== undefined)
  }
  return (await Promise.all(sessions.map(inSession))).flat()
}

/** What the store holds that nothing needs, by kind, scanned now. */
export async function findOrphans(sql: SQL, filesRoot: string): Promise<Orphans> {
  const rows = await sql<{ sessionId: string; id: string; bytes: number; createdAt: string; saved: number }[]>`
    SELECT i.session_id AS "sessionId", i.id AS id, i.bytes AS bytes, i.created_at AS "createdAt",
           EXISTS (SELECT 1 FROM nasi_session s WHERE s.id = i.session_id) AS saved
    FROM nasi_image i`
  const known = new Set(rows.map(row => imagePath(filesRoot, row.sessionId, row.id)))
  const unsavedBefore = Date.now() - UNSAVED_AFTER_MS
  const files = (await storedFiles(filesRoot)).filter(file => !known.has(file.path))
  const checked = await Promise.all(
    rows.map(async row => {
      const item = {
        path: imagePath(filesRoot, row.sessionId, row.id),
        bytes: row.bytes,
        at: new Date(row.createdAt),
        sessionId: row.sessionId,
        id: row.id
      }
      if (!row.saved && item.at.getTime() < unsavedBefore) return { item, kind: "unsaved" as const }
      return { item, kind: (await Bun.file(item.path).exists()) ? ("kept" as const) : ("rows" as const) }
    })
  )
  const ofKind = (kind: "unsaved" | "rows") => checked.filter(each => each.kind === kind).map(each => each.item)
  const unsaved = ofKind("unsaved")
  const missing = ofKind("rows")
  const summary = (items: Orphan[]) => ({
    count: items.length,
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
    examples: items.slice(0, MAX_EXAMPLES).map(item => item.path),
    items
  })
  return { files: summary(files), rows: summary(missing), unsaved: summary(unsaved) }
}

/** Removes one kind of orphan, as `found` listed it; each is checked again, and anything younger than `graceMs` stays. */
export async function removeOrphans(
  sql: SQL,
  kind: OrphanKind,
  found: Orphans,
  graceMs = ORPHAN_GRACE_MS
): Promise<number> {
  const settled = Date.now() - graceMs
  const hasRow = async (sessionId: string, id: string) =>
    (await sql`SELECT 1 FROM nasi_image WHERE session_id = ${sessionId} AND id = ${id}`).length > 0
  const deleteRow = async (item: Orphan) =>
    (await sql.begin(tx => tx`DELETE FROM nasi_image WHERE session_id = ${item.sessionId} AND id = ${item.id!}`))
      .affectedRows as number
  // Each item checked again just before it goes; the count of what went
  const remove: Record<OrphanKind, (item: Orphan) => Promise<number>> = {
    async files(item) {
      if (item.id && (await hasRow(item.sessionId, item.id))) return 0
      await rm(item.path, { force: true })
      return 1
    },
    async rows(item) {
      return (await Bun.file(item.path).exists()) ? 0 : deleteRow(item)
    },
    async unsaved(item) {
      if ((await sql`SELECT 1 FROM nasi_session WHERE id = ${item.sessionId}`).length > 0) return 0
      await rm(item.path, { force: true })
      return deleteRow(item)
    }
  }
  const settledItems = found[kind].items.filter(item => item.at.getTime() < settled)
  const counts = await Promise.all(settledItems.map(item => remove[kind](item)))
  return counts.reduce((sum, count) => sum + count, 0)
}
