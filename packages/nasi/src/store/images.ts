import type { Files } from "files-sdk"
import { imageRefs, type StoredImage } from "./rows"

/** An image's object key: `<prefix>/<hash>`, where the prefix names the session (and, in the cloud, its user). */
export const imageKey = (prefix: string, hash: string) => `${prefix}/${hash}`

/** Uploads a message's detached images; the same hash is the same bytes, so a repeat upload is harmless. */
export async function saveImages(files: Files, prefix: string, images: StoredImage[]): Promise<void> {
  await Promise.all(
    images.map(image => files.upload(imageKey(prefix, image.hash), image.data, { contentType: image.mimeType }))
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
      const key = imageKey(prefix, hash)
      if (!(await files.exists(key))) return null
      const file = await files.download(key)
      return [hash, { mimeType: file.type, data: new Uint8Array(await file.arrayBuffer()) }] as const
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
