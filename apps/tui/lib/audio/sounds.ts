import { createHash } from "node:crypto"
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs"
import { join } from "node:path"
import { type SoundsManifest, SoundsManifestSchema } from "@kaja/schema/config"
import { KAJA_USER_AGENT } from "../auth/user-agent"
import { getApiBaseUrl } from "../config/api-url"
import { log } from "../logger"
import { getSoundsDir } from "../paths"

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

async function get(path: string, timeoutMs: number) {
  const res = await fetch(new URL(path, getApiBaseUrl()), {
    headers: { "User-Agent": KAJA_USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
  return res
}

async function download(dir: string, { name, size, sha256 }: SoundsManifest["files"][number], timeoutMs: number) {
  const target = join(dir, name)
  // Cheap size check first; only a same-sized file is worth hashing
  if (existsSync(target) && statSync(target).size === size && hashOf(await Bun.file(target).bytes()) === sha256) return

  const bytes = new Uint8Array(await (await get(`/config/sounds/${name}`, timeoutMs)).arrayBuffer())
  if (hashOf(bytes) !== sha256) throw new Error(`${name} does not match the manifest`)
  // Renamed into place so a player never opens a half-written file
  await Bun.write(`${target}.part`, bytes)
  renameSync(`${target}.part`, target)
}

/**
 * Downloads the sound effects the API serves into the data dir (`getSoundsDir`), only those missing or changed there.
 * Returns whether the folder is up to date; a failure is logged, never thrown, and leaves what was there.
 */
export async function syncSounds(timeoutMs = 10_000): Promise<boolean> {
  const dir = getSoundsDir()
  try {
    const { files } = SoundsManifestSchema.parse(await (await get("/config/sounds", timeoutMs)).json())
    mkdirSync(dir, { recursive: true })

    await Promise.all(files.map(file => download(dir, file, timeoutMs)))
    return true
  } catch (error) {
    log.warn("Could not sync sounds", { dir, error })
    return false
  }
}
