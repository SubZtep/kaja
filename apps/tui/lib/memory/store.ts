import { join } from "node:path"
import type { NasiStore } from "@kaja/nasi"
import { stringifyToml } from "@kaja/shared/toml"
import { file } from "bun"
import { getConfigPath, invalidateConfigCache, readConfigLoose } from "../config/config"
import { writeConfigFile } from "../config/schema-file"
import { log } from "../logger"
import { getPaths } from "../paths"
import { createSqliteStore, imagesRoot } from "../store/sqlite"

export function getDefaultMemoryDbPath() {
  return join(getPaths().data, "memory.sqlite")
}

export async function resolveMemoryDbPath(): Promise<string> {
  const loose = await readConfigLoose()
  return loose.memory?.dbPath || getDefaultMemoryDbPath()
}

async function persistDbPathIfMissing(dbPath: string) {
  try {
    const configPath = getConfigPath()
    if (!(await file(configPath).exists())) return
    const loose = await readConfigLoose()
    if (loose.memory?.dbPath) return
    await writeConfigFile(configPath, stringifyToml({ ...loose, memory: { ...loose.memory, dbPath } }))
    invalidateConfigCache()
  } catch (error) {
    log.warn("Failed to persist memory db path to config", { error, dbPath })
  }
}

// The open is kept as a promise, so callers racing the first open share one connection
let cached: { path: string; opening: Promise<NasiStore>; store?: NasiStore } | undefined

export async function getStore(): Promise<NasiStore> {
  const dbPath = await resolveMemoryDbPath()
  if (cached?.path !== dbPath) {
    const entry: NonNullable<typeof cached> = { path: dbPath, opening: createSqliteStore(dbPath) }
    cached = entry
    entry.store = await entry.opening
    await persistDbPathIfMissing(dbPath)
  }
  return cached.opening
}

export function peekStore(): NasiStore | undefined {
  return cached?.store
}

/** Where a stored image's object (an `AgentEvent`'s `tool_image` `key`) is on disk, once the store is open. */
export function storedImagePath(key: string): string | undefined {
  return cached && join(imagesRoot(cached.path), key)
}

export function peekStorePath(): string | undefined {
  return cached?.path
}

export async function loadMemory(...args: Parameters<NasiStore["loadMemory"]>) {
  return (await getStore()).loadMemory(...args)
}

export async function saveMemory(...args: Parameters<NasiStore["saveMemory"]>) {
  return (await getStore()).saveMemory(...args)
}

export async function latestDatasetVersion(...args: Parameters<NasiStore["latestDatasetVersion"]>) {
  return (await getStore()).latestDatasetVersion(...args)
}

export async function loadDatasetAnswers(...args: Parameters<NasiStore["loadDatasetAnswers"]>) {
  return (await getStore()).loadDatasetAnswers(...args)
}

export async function loadDatasetVersionCompletedAt(...args: Parameters<NasiStore["loadDatasetVersionCompletedAt"]>) {
  return (await getStore()).loadDatasetVersionCompletedAt(...args)
}

export async function markDatasetVersionComplete(...args: Parameters<NasiStore["markDatasetVersionComplete"]>) {
  return (await getStore()).markDatasetVersionComplete(...args)
}

export async function saveDatasetAnswer(...args: Parameters<NasiStore["saveDatasetAnswer"]>) {
  return (await getStore()).saveDatasetAnswer(...args)
}
