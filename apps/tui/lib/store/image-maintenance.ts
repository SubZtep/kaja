import type { Database } from "bun:sqlite"
import { readdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { describeImage, type Describer, IMAGE_REF_PREFIX, imageDataUrl, imageLabel, relabeledParts } from "@kaja/nasi"
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
export function localImageStats(db: Database): LocalImageStats {
  const totals = db
    .query("SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes, COUNT(description) AS described FROM images")
    .get() as { count: number; bytes: number; described: number }
  const urls = db.query("SELECT sourceUrl FROM images WHERE sourceUrl IS NOT NULL").all() as { sourceUrl: string }[]
  const perSite = new Map<string, number>()
  for (const { sourceUrl } of urls) {
    const host = siteOf(sourceUrl)
    if (host) perSite.set(host, (perSite.get(host) ?? 0) + 1)
  }
  // Only saved sessions: a new session's images arrive before its first save
  const sessions = db
    .query(
      `SELECT s.id AS id, s.title AS title, COUNT(*) AS images, SUM(i.bytes) AS bytes
       FROM images i JOIN sessions s ON s.id = i.sessionId
       GROUP BY s.id ORDER BY bytes DESC, s.id LIMIT ${TOP}`
    )
    .all() as LocalImageStats["sessions"]
  return {
    ...totals,
    undescribed: totals.count - totals.described,
    sites: [...perSite]
      .map(([host, images]) => ({ host, images }))
      .toSorted((a, b) => b.images - a.images || a.host.localeCompare(b.host))
      .slice(0, TOP),
    sessions
  }
}

export type LocalImage = { sessionId: string; id: string; mimeType: string; width: number; height: number }

/** Images still without a description, oldest first; ones given up on only with `retry`. */
export function imagesToDescribe(db: Database, retry: boolean): LocalImage[] {
  return db
    .query(
      `SELECT sessionId, id, mimeType, width, height FROM images
       WHERE description IS NULL ${retry ? "" : `AND describeAttempts < ${MAX_DESCRIBE_ATTEMPTS}`}
       ORDER BY createdAt`
    )
    .all() as LocalImage[]
}

const imagePath = (filesRoot: string, sessionId: string, id: string) => join(filesRoot, "images", sessionId, id)

/**
 * Has the vision model describe one image and keeps the description: in the row, in its saved messages' labels, and
 * as a model call of its saved session. Undefined when its file is gone or the model gave nothing back; a failed call
 * is counted as a try and thrown.
 */
export async function describeLocalImage(
  db: Database,
  filesRoot: string,
  describer: Describer,
  image: LocalImage
): Promise<string | undefined> {
  const tried = () =>
    db
      .query(
        "UPDATE images SET describeAttempts = describeAttempts + 1, describeTriedAt = $at WHERE sessionId = $sessionId AND id = $id"
      )
      .run({ $at: new Date().toISOString(), $sessionId: image.sessionId, $id: image.id })
  const file = Bun.file(imagePath(filesRoot, image.sessionId, image.id))
  if (!(await file.exists())) {
    tried()
    return undefined
  }
  const data = new Uint8Array(await file.arrayBuffer())
  let text: string | undefined
  try {
    text = await describeImage(describer, imageDataUrl({ data, mimeType: image.mimeType }), usage => {
      db.query(
        `INSERT INTO model_calls (sessionId, kind, model, promptTokens, completionTokens, latencyMs, createdAt)
         SELECT $sessionId, 'describe', $model, $promptTokens, $completionTokens, $latencyMs, $now
         WHERE EXISTS (SELECT 1 FROM sessions WHERE id = $sessionId)`
      ).run({
        $sessionId: image.sessionId,
        $model: usage.model,
        $promptTokens: usage.promptTokens ?? null,
        $completionTokens: usage.completionTokens ?? null,
        $latencyMs: usage.latencyMs,
        $now: new Date().toISOString()
      })
    })
  } finally {
    tried()
  }
  if (!text) return undefined
  db.query(
    `UPDATE images SET description = $description, descriptionModel = $model, describedAt = $at
     WHERE sessionId = $sessionId AND id = $id`
  ).run({
    $description: text,
    $model: describer.model,
    $at: new Date().toISOString(),
    $sessionId: image.sessionId,
    $id: image.id
  })
  relabel(db, image, text)
  return text
}

// The image's label in its saved messages, with `description` in place of what it said before (its alt text)
function relabel(db: Database, image: LocalImage, description: string) {
  const ref = `${IMAGE_REF_PREFIX}${image.id}`
  const rows = db
    .query("SELECT id, parts FROM messages WHERE sessionId = $sessionId AND parts LIKE $label")
    .all({ $sessionId: image.sessionId, $label: `%${imageLabel(ref, undefined, "").slice(0, -3)}%` }) as {
    id: string
    parts: string
  }[]
  for (const message of rows) {
    const parts = relabeledParts(JSON.parse(message.parts) as unknown[], ref, image, description)
    if (parts)
      db.query("UPDATE messages SET parts = $parts WHERE id = $id").run({
        $parts: JSON.stringify(parts),
        $id: message.id
      })
  }
}

/** Orphan kinds: files with no row, rows whose file is gone, and images of sessions never saved (over a day ago). */
export type OrphanKind = "files" | "rows" | "unsaved"

type Orphan = { path: string; bytes: number; at: Date; sessionId: string; id?: string }

export type Orphans = Record<OrphanKind, { count: number; bytes: number; examples: string[]; items: Orphan[] }>

// Every stored file under files/images/<sessionId>/<id> (a leftover <id>.json from before the table isn't an image)
async function storedFiles(filesRoot: string): Promise<Orphan[]> {
  const root = join(filesRoot, "images")
  const sessions = await readdir(root).catch(() => [] as string[])
  const found: Orphan[] = []
  for (const sessionId of sessions) {
    const names = await readdir(join(root, sessionId)).catch(() => [] as string[])
    for (const name of names) {
      if (name.endsWith(".json")) continue
      const path = join(root, sessionId, name)
      const info = await stat(path).catch(() => undefined)
      if (info?.isFile()) found.push({ path, bytes: info.size, at: info.mtime, sessionId, id: name })
    }
  }
  return found
}

/** What the store holds that nothing needs, by kind, scanned now. */
export async function findOrphans(db: Database, filesRoot: string): Promise<Orphans> {
  const rows = db
    .query(
      `SELECT i.sessionId AS sessionId, i.id AS id, i.bytes AS bytes, i.createdAt AS createdAt,
              EXISTS (SELECT 1 FROM sessions s WHERE s.id = i.sessionId) AS saved
       FROM images i`
    )
    .all() as { sessionId: string; id: string; bytes: number; createdAt: string; saved: number }[]
  const known = new Set(rows.map(row => imagePath(filesRoot, row.sessionId, row.id)))
  const unsavedBefore = Date.now() - UNSAVED_AFTER_MS
  const files = (await storedFiles(filesRoot)).filter(file => !known.has(file.path))
  const unsaved: Orphan[] = []
  const missing: Orphan[] = []
  for (const row of rows) {
    const item = {
      path: imagePath(filesRoot, row.sessionId, row.id),
      bytes: row.bytes,
      at: new Date(row.createdAt),
      sessionId: row.sessionId,
      id: row.id
    }
    if (!row.saved && item.at.getTime() < unsavedBefore) unsaved.push(item)
    else if (!(await Bun.file(item.path).exists())) missing.push(item)
  }
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
  db: Database,
  kind: OrphanKind,
  found: Orphans,
  graceMs = ORPHAN_GRACE_MS
): Promise<number> {
  const settled = Date.now() - graceMs
  const hasRow = (sessionId: string, id: string) =>
    db
      .query("SELECT 1 FROM images WHERE sessionId = $sessionId AND id = $id")
      .get({ $sessionId: sessionId, $id: id }) !== null
  let removed = 0
  for (const item of found[kind].items) {
    if (item.at.getTime() >= settled) continue
    if (kind === "files") {
      if (item.id && hasRow(item.sessionId, item.id)) continue
      await rm(item.path, { force: true })
      removed++
    } else if (kind === "rows") {
      if (await Bun.file(item.path).exists()) continue
      removed += db
        .query("DELETE FROM images WHERE sessionId = $sessionId AND id = $id")
        .run({ $sessionId: item.sessionId, $id: item.id! }).changes
    } else {
      if (db.query("SELECT 1 FROM sessions WHERE id = $id").get({ $id: item.sessionId }) !== null) continue
      await rm(item.path, { force: true })
      removed += db
        .query("DELETE FROM images WHERE sessionId = $sessionId AND id = $id")
        .run({ $sessionId: item.sessionId, $id: item.id! }).changes
    }
  }
  return removed
}
