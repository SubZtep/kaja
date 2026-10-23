import { imageKey, sessionImagePrefix } from "@kaja/nasi"
import type { AdminImage, AdminImagesQuery, StatsChannel } from "@kaja/schema/api"
import type { Pool } from "pg"
import { imageUrl, objects } from "../core/files"

/** A page of the admin images list. */
export const IMAGES_PAGE = 48

/** The SQL for a `source_url` column's host, lowercased and without `www.`; null when it isn't an http(s) URL. */
export const sourceHost = (column: string) =>
  `regexp_replace(lower(substring(${column} FROM '^https?://([^/:?#]+)')), '^www\\.', '')`

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

/** Stored images across users, for admins: listed newest first and filtered, and removed one at a time. */
export class ImageService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** One page of images matching every filter given; `next` is the cursor for the page after it. */
  async list(query: AdminImagesQuery): Promise<{ images: AdminImage[]; next: string | null }> {
    const params: unknown[] = []
    const param = (value: unknown) => `$${params.push(value)}`
    const where: string[] = []
    if (query.user) where.push(`i.user_id = ${param(query.user)}`)
    if (query.site) where.push(`${sourceHost("i.source_url")} = ${param(query.site.replace(/^www\./, ""))}`)
    if (query.undescribed !== undefined) where.push(`i.description IS ${query.undescribed ? "" : "NOT "}NULL`)
    if (query.origin === "url") where.push("i.source_url IS NOT NULL")
    if (query.origin === "file") where.push("i.file_name IS NOT NULL")
    if (query.origin === "none") where.push("i.source_url IS NULL AND i.file_name IS NULL")
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

  /** Removes one image, its object first and then its row; the owner's id, or undefined when there's no such image. */
  async remove(sessionId: string, id: string): Promise<{ userId: string } | undefined> {
    const { rows } = await this.#db.query<{ user_id: string }>(
      "SELECT user_id FROM nasi_image WHERE session_id = $1 AND id = $2",
      [sessionId, id]
    )
    const userId = rows[0]?.user_id
    if (!userId) return undefined
    await objects.delete(imageKey(sessionImagePrefix(sessionId, userId), id))
    await this.#db.query("DELETE FROM nasi_image WHERE session_id = $1 AND id = $2", [sessionId, id])
    return { userId }
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
      url: imageUrl(imageKey(sessionImagePrefix(row.session_id, row.user_id), row.id)),
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
