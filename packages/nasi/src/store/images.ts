import { ImageError, normalizeImage } from "../images/normalize"
import { dataUrlBytes, imageDataUrl } from "../images/parts"
import type { ObjectStore } from "./objects"

/** What an image part's URL is while its bytes are in the session's store: `kaja-image:<id>`. */
export const IMAGE_REF_PREFIX = "kaja-image:"

/** Where a user's session images live (cloud); a local store has one user, so it passes none. */
export const userImagePrefix = (userId?: string) => (userId ? `images/${userId}` : "images")

/** Where one session's images live: `images/<userId>/<sessionId>` in the cloud, `images/<sessionId>` locally. */
export const sessionImagePrefix = (sessionId: string, userId?: string) => `${userImagePrefix(userId)}/${sessionId}`

/** An image's object key: `<prefix>/<id>`. */
export const imageKey = (prefix: string, id: string) => `${prefix}/${id}`

/** An image's id within its session: the first 16 hex characters of its bytes' sha256, so the same image is stored once. */
export function imageId(data: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(data).digest("hex").slice(0, 16)
}

/** The stored image a part's URL refers to, or undefined for any other URL. */
export function imageRefId(url: string): string | undefined {
  return url.startsWith(IMAGE_REF_PREFIX) ? url.slice(IMAGE_REF_PREFIX.length) : undefined
}

const IMAGE_LINK = /\]\(kaja-image:([0-9a-f]{16})\)/g

/**
 * `text` with each Markdown image's `kaja-image:` link swapped for where `url` says it is; one it can't place stays as
 * it is.
 */
export function resolveImageLinks(text: string, url: (id: string) => string | undefined): string {
  return text.includes("kaja-image:")
    ? text.replace(IMAGE_LINK, (link, id: string) => {
        const resolved = url(id)
        return resolved ? `](${resolved})` : link
      })
    : text
}

export type SessionImage = { data: Uint8Array; mimeType: string }

/** An image as it's stored: its bytes and type, and its size in pixels. */
export type StoredImage = SessionImage & { width: number; height: number }

/** One session's images: put when they arrive (already normalised), got back when a model request needs the bytes. */
export type SessionImages = {
  /** Stores an image once; `ref` is what the message holds, `key` its object key. */
  put(image: StoredImage): Promise<{ ref: string; key?: string }>
  get(id: string): Promise<SessionImage | undefined>
  /** Where a viewer opens the image: its public URL, or its file; undefined where the host has none. */
  location(id: string): string | undefined
  /** Keeps an image's description in its row, with the model that wrote it. */
  describe(id: string, description: string, model: string): Promise<void>
  /** The description kept for an image, if one was written. */
  description(id: string): Promise<string | undefined>
  /** Removes every image of the session. */
  clear(): Promise<void>
}

/** What a store keeps about one image; the bytes are an object. */
export type ImageRow = { id: string; mimeType: string; width: number; height: number; bytes: number }

/** One session's image rows, in the store's database (Postgres, SQLite) or in memory. */
export type ImageRows = {
  /** Adds a row; one already there is kept. */
  add(row: ImageRow): Promise<void>
  get(id: string): Promise<(ImageRow & { description?: string }) | undefined>
  describe(id: string, description: string, model: string): Promise<void>
  clear(): Promise<void>
}

/** A session's image rows in memory, for the memory store and tests. */
export function memoryImageRows(): ImageRows {
  const rows = new Map<string, ImageRow & { description?: string }>()
  return {
    add(row) {
      if (!rows.has(row.id)) rows.set(row.id, { ...row })
      return Promise.resolve()
    },
    get(id) {
      const row = rows.get(id)
      return Promise.resolve(row && { ...row })
    },
    describe(id, description) {
      const row = rows.get(id)
      if (row) row.description = description
      return Promise.resolve()
    },
    clear: () => Promise.resolve(rows.clear())
  }
}

/**
 * A session's images as objects under `prefix` (the cloud's bucket, the TUI's folder beside its database), described
 * by `rows`. The object is written before its row, so a row always has its bytes.
 */
export function objectSessionImages(objects: ObjectStore, prefix: string, rows: ImageRows): SessionImages {
  return {
    async put(image) {
      const id = imageId(image.data)
      const key = imageKey(prefix, id)
      if (!(await rows.get(id))) {
        await objects.put(key, image.data, image.mimeType)
        const { mimeType, width, height } = image
        await rows.add({ id, mimeType, width, height, bytes: image.data.byteLength })
      }
      return { ref: `${IMAGE_REF_PREFIX}${id}`, key }
    },
    async get(id) {
      const row = await rows.get(id)
      const data = row && (await objects.get(imageKey(prefix, id)))
      return data ? { data, mimeType: row.mimeType } : undefined
    },
    location: id => objects.location?.(imageKey(prefix, id)),
    describe: (id, description, model) => rows.describe(id, description, model),
    description: async id => (await rows.get(id))?.description,
    async clear() {
      await objects.deletePrefix(`${prefix}/`)
      await rows.clear()
    }
  }
}

/** No store to keep them: an image stays in its message as a data URL. */
export const inlineImages: SessionImages = {
  put: image => Promise.resolve({ ref: imageDataUrl(image) }),
  get: () => Promise.resolve(undefined),
  location: () => undefined,
  describe: () => Promise.resolve(),
  description: () => Promise.resolve(undefined),
  clear: () => Promise.resolve()
}

type ImagePart = { type: "image_url"; image_url: { url: string } }

const isImagePart = (part: unknown): part is ImagePart =>
  (part as ImagePart)?.type === "image_url" && typeof (part as ImagePart).image_url?.url === "string"

/**
 * A message's parts with any image still inline (a data URL: a run without the store) stored and referred to, so a
 * saved message never holds the bytes; one that can't be read becomes a note.
 */
export async function storeInlineImages(parts: unknown[] | null, images: SessionImages): Promise<unknown[] | null> {
  if (!parts?.some(part => isImagePart(part) && part.image_url.url.startsWith("data:"))) return parts
  return Promise.all(
    parts.map(async part => {
      const bytes = isImagePart(part) ? dataUrlBytes(part.image_url.url) : undefined
      if (!bytes) return part
      try {
        const { ref } = await images.put(await normalizeImage(bytes))
        return { ...(part as ImagePart), image_url: { ...(part as ImagePart).image_url, url: ref } }
      } catch (error) {
        if (!(error instanceof ImageError)) throw error
        return { type: "text", text: `[an image that couldn't be kept: ${error.message}]` }
      }
    })
  )
}
