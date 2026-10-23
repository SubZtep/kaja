import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { SoundsManifest } from "@kaja/schema/config"

// Prod runs from the Docker WORKDIR with public/ beside server.js; unbundled (dev, tests) the folder is two levels up.
// oxlint-disable-next-line bun/no-cwd-dependent-path -- the Dockerfile copies public/ next to server.js under the working directory
const candidates = [resolve("public/sounds"), resolve(import.meta.dir, "../../public/sounds")]

let loaded: Promise<{ dir: string; manifest: SoundsManifest }> | undefined

async function load() {
  const dir = candidates.find(existsSync)
  if (!dir) return { dir: "", manifest: { files: [] } }
  // legal.txt carries the sounds' attributions, so it travels with them
  const names = (await readdir(dir)).filter(name => name.endsWith(".wav") || name === "legal.txt").sort()
  const files = await Promise.all(
    names.map(async name => {
      const bytes = await Bun.file(join(dir, name)).bytes()
      return { name, size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }
    })
  )
  return { dir, manifest: { files } }
}

/** The hook sound effects the terminal downloads: a manifest to diff against, read from disk once. */
export function sounds() {
  loaded ??= load()
  return loaded
}

/** Only names the manifest lists, so a request never reaches outside the folder. */
export async function soundFile(name: string) {
  const { dir, manifest } = await sounds()
  return manifest.files.some(file => file.name === name) ? Bun.file(join(dir, name)) : undefined
}
