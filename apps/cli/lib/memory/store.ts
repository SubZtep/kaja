import { join } from "node:path"
import type { NasiStore } from "@kaja/nasi"
import { file, TOML, write } from "bun"
import { getConfigPath, invalidateConfigCache, readConfigLoose } from "../config/config"
import { getPaths } from "../paths"
import { createSqliteStore } from "../store/sqlite"

export { type DatasetAnswer, forgetNotes, noteHeader } from "@kaja/nasi"

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
    await write(file(configPath), TOML.stringify({ ...loose, memory: { ...loose.memory, dbPath } })!)
    invalidateConfigCache()
  } catch {}
}

let cached: { path: string; store: NasiStore } | undefined

export async function getStore(): Promise<NasiStore> {
  const dbPath = await resolveMemoryDbPath()
  if (cached?.path !== dbPath) {
    cached = { path: dbPath, store: createSqliteStore(dbPath) }
    await persistDbPathIfMissing(dbPath)
  }
  return cached.store
}

export function peekStore(): NasiStore | undefined {
  return cached?.store
}

export function peekStorePath(): string | undefined {
  return cached?.path
}

export async function loadMemory() {
  return (await getStore()).loadMemory()
}

export async function saveMemory(store: Parameters<NasiStore["saveMemory"]>[0]) {
  return (await getStore()).saveMemory(store)
}

export async function latestDatasetVersion(...args: Parameters<NasiStore["latestDatasetVersion"]>) {
  return (await getStore()).latestDatasetVersion(...args)
}

export async function listAllDatasetAnswers() {
  return (await getStore()).listAllDatasetAnswers()
}

export async function listDatasetVersionsSummary() {
  return (await getStore()).listDatasetVersionsSummary()
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
