import { readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

/** Where a host keeps blobs by key (session images): an S3 bucket in the cloud, a folder locally, memory in tests. */
export type ObjectStore = {
  put(key: string, data: Uint8Array | string, type?: string): Promise<void>
  /** The object's bytes, or undefined when there's none under `key`. */
  get(key: string): Promise<Uint8Array | undefined>
  exists(key: string): Promise<boolean>
  /** Removes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>
  /** Where a viewer opens the object: a public URL, or a file path; unset when there's nowhere. */
  location?(key: string): string
}

/** Objects in memory, for tests and hosts that keep nothing. */
export function memoryObjects(): ObjectStore {
  const objects = new Map<string, Uint8Array>()
  return {
    put: (key, data) => {
      objects.set(key, typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data))
      return Promise.resolve()
    },
    get: key => Promise.resolve(objects.get(key)),
    exists: key => Promise.resolve(objects.has(key)),
    deletePrefix: prefix => {
      // Deleting the key an iteration just read is safe on a Map, so no snapshot is needed.
      for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key)
      return Promise.resolve()
    }
  }
}

/** Objects as plain files under `root` (the key is the path), as the TUI keeps them beside its database. */
export function folderObjects(root: string): ObjectStore {
  const path = (key: string) => join(root, key)
  return {
    put: async (key, data) => {
      await Bun.write(path(key), data, { createPath: true })
    },
    get: async key => {
      const file = Bun.file(path(key))
      return (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : undefined
    },
    exists: key => Bun.file(path(key)).exists(),
    deletePrefix: async prefix => {
      // A prefix ending in "/" is a folder; otherwise it's the start of names in its folder.
      if (prefix.endsWith("/")) return rm(path(prefix), { recursive: true, force: true })
      const folder = dirname(path(prefix))
      const start = path(prefix).slice(folder.length + 1)
      const names = await readdir(folder).catch(() => [])
      await Promise.all(
        names.filter(name => name.startsWith(start)).map(name => rm(join(folder, name), { force: true }))
      )
    },
    location: path
  }
}
