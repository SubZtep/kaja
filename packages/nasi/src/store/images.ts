import { type Files, FilesError } from "files-sdk"
import { ImageError, normalizeImage } from "../images/normalize"
import { dataUrlBytes, imageDataUrl } from "../images/parts"
import { warn } from "../warn"

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

export type SessionImage = { data: Uint8Array; mimeType: string }

/** One session's images: put when they arrive (already normalised), got back when a model request needs the bytes. */
export type SessionImages = {
  /** Stores an image once (and the untouched original beside it, `<key>.orig`, for debugging only); `ref` is what the message holds, `key` its object key. */
  put(image: SessionImage, original?: Uint8Array): Promise<{ ref: string; key?: string }>
  get(id: string): Promise<SessionImage | undefined>
  /** Removes every image of the session. */
  clear(): Promise<void>
}

/** A session's images as objects under `prefix` in `files` (the cloud's bucket, the TUI's folder beside its database). */
export function filesSessionImages(files: Files, prefix: string): SessionImages {
  return {
    async put(image, original) {
      const id = imageId(image.data)
      const key = imageKey(prefix, id)
      const keepOriginal = async () => {
        // Normalising hands back the very bytes it got when they were already fine: nothing else to keep.
        if (!original || original === image.data) return
        try {
          if (!(await files.exists(`${key}.orig`))) await files.upload(`${key}.orig`, original)
        } catch (error) {
          warn("An image's original couldn't be kept", { key, error })
        }
      }
      const keep = async () => {
        if (!(await files.exists(key))) await files.upload(key, image.data, { contentType: image.mimeType })
      }
      await Promise.all([keep(), keepOriginal()])
      return { ref: `${IMAGE_REF_PREFIX}${id}`, key }
    },
    async get(id) {
      try {
        const file = await files.download(imageKey(prefix, id))
        const data = new Uint8Array(await file.arrayBuffer())
        // The bytes say what they are: an fs adapter has no stored content type.
        const { format } = await new Bun.Image(data).metadata()
        return { data, mimeType: `image/${format}` }
      } catch (error) {
        if (error instanceof FilesError && error.code === "NotFound") return undefined
        throw error
      }
    },
    clear: () => deleteImages(files, prefix)
  }
}

/** No store to keep them: an image stays in its message as a data URL. */
export const inlineImages: SessionImages = {
  put: async image => ({ ref: imageDataUrl(image) }),
  get: async () => undefined,
  clear: async () => {}
}

/** Removes every image under the prefix: a session's, or all of a user's. */
export async function deleteImages(files: Files, prefix: string): Promise<void> {
  const keys: string[] = []
  for await (const file of files.listAll({ prefix: `${prefix}/` })) keys.push(file.key)
  if (keys.length > 0) await files.delete(keys)
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
