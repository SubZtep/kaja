import { type Files, FilesError } from "files-sdk"
import { imageRefs, type StoredImage } from "./rows"

/** Where a user's session images live (cloud); a local store has one user, so it passes none. */
export const userImagePrefix = (userId?: string) => (userId ? `images/${userId}` : "images")

/** Where one session's images live: `images/<userId>/<sessionId>` in the cloud, `images/<sessionId>` locally. */
export const sessionImagePrefix = (sessionId: string, userId?: string) => `${userImagePrefix(userId)}/${sessionId}`

/** An image's object key: `<prefix>/<hash>`. */
export const imageKey = (prefix: string, hash: string) => `${prefix}/${hash}`

/** Uploads a message's detached images, skipping any already stored (the same hash is the same bytes; a tool image may be there from its turn). */
export async function saveImages(files: Files, prefix: string, images: StoredImage[]): Promise<void> {
  await Promise.all(
    images.map(async image => {
      const key = imageKey(prefix, image.hash)
      if (!(await files.exists(key))) await files.upload(key, image.data, { contentType: image.mimeType })
    })
  )
}

/** The stored images the messages' parts refer to, by hash, for {@link attachImages}; a missing one is left out. */
export async function loadImages(
  files: Files,
  prefix: string,
  parts: (unknown[] | null)[]
): Promise<Map<string, Omit<StoredImage, "hash">>> {
  const hashes = [...new Set(parts.flatMap(imageRefs))]
  const loaded = await Promise.all(
    hashes.map(async hash => {
      try {
        const file = await files.download(imageKey(prefix, hash))
        return [hash, { mimeType: file.type, data: new Uint8Array(await file.arrayBuffer()) }] as const
      } catch (error) {
        if (error instanceof FilesError && error.code === "NotFound") return null
        throw error
      }
    })
  )
  return new Map(loaded.filter(entry => entry !== null))
}

/** Removes every image under the prefix: a session's, or all of a user's. */
export async function deleteImages(files: Files, prefix: string): Promise<void> {
  const keys: string[] = []
  for await (const file of files.listAll({ prefix: `${prefix}/` })) keys.push(file.key)
  if (keys.length > 0) await files.delete(keys)
}
