import { ImageError, normalizeImage } from "../images/normalize"
import { dataUrlBytes, imageDataUrl } from "../images/parts"
import { warn } from "../warn"
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

/** `text` with each Markdown image's `kaja-image:` link swapped for where `url` says it is; one it can't place stays as it is. */
export function resolveImageLinks(text: string, url: (id: string) => string | undefined): string {
  return text.includes("kaja-image:")
    ? text.replace(IMAGE_LINK, (link, id: string) => {
        const resolved = url(id)
        return resolved ? `](${resolved})` : link
      })
    : text
}

export type SessionImage = { data: Uint8Array; mimeType: string }

/** One session's images: put when they arrive (already normalised), got back when a model request needs the bytes. */
export type SessionImages = {
  /**
   * Stores an image once, and its untouched original beside it (`<key>.orig`); `ref` is what the message holds, `key`
   * its object key, `original` the object a viewer opens: the original when one was kept, else the image itself.
   */
  put(image: SessionImage, original?: Uint8Array): Promise<{ ref: string; key?: string; original?: string }>
  get(id: string): Promise<SessionImage | undefined>
  /** Keeps an image's description beside it (`<key>.json`), with the model that wrote it. */
  describe(id: string, description: string, model: string): Promise<void>
  /** The description kept beside an image, if one was written. */
  description(id: string): Promise<string | undefined>
  /** Removes every image of the session. */
  clear(): Promise<void>
}

// What an image's bytes are, by their header: an original may be one Bun can't decode here (HEIC on Linux).
async function typeOf(data: Uint8Array): Promise<string> {
  try {
    return `image/${(await new Bun.Image(data).metadata()).format}`
  } catch {
    return "application/octet-stream"
  }
}

/** A session's images as objects under `prefix` (the cloud's bucket, the TUI's folder beside its database). */
export function objectSessionImages(objects: ObjectStore, prefix: string): SessionImages {
  return {
    async put(image, original) {
      const id = imageId(image.data)
      const key = imageKey(prefix, id)
      // Normalising hands back the very bytes it got when they were already fine: the image is its own original.
      const kept = original && original !== image.data ? `${key}.orig` : key
      const keepOriginal = async () => {
        if (kept === key || (await objects.exists(kept))) return
        try {
          await objects.put(kept, original!, await typeOf(original!))
        } catch (error) {
          warn("An image's original couldn't be kept", { key, error })
        }
      }
      const keep = async () => {
        if (!(await objects.exists(key))) await objects.put(key, image.data, image.mimeType)
      }
      await Promise.all([keep(), keepOriginal()])
      return { ref: `${IMAGE_REF_PREFIX}${id}`, key, original: kept }
    },
    async get(id) {
      const data = await objects.get(imageKey(prefix, id))
      if (!data) return undefined
      // The bytes say what they are: a folder keeps no content type.
      return { data, mimeType: await typeOf(data) }
    },
    async describe(id, description, model) {
      const sidecar = { description, model, at: new Date().toISOString() }
      await objects.put(`${imageKey(prefix, id)}.json`, JSON.stringify(sidecar), "application/json")
    },
    async description(id) {
      const data = await objects.get(`${imageKey(prefix, id)}.json`)
      if (!data) return undefined
      const { description } = JSON.parse(new TextDecoder().decode(data)) as { description?: unknown }
      return typeof description === "string" ? description : undefined
    },
    clear: () => objects.deletePrefix(`${prefix}/`)
  }
}

/** No store to keep them: an image stays in its message as a data URL. */
export const inlineImages: SessionImages = {
  put: async image => ({ ref: imageDataUrl(image) }),
  get: async () => undefined,
  describe: async () => {},
  description: async () => undefined,
  clear: async () => {}
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
