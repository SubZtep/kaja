import { join } from "node:path"
import {
  type DatasetAnswer,
  forgetNotes,
  getDb as nasiGetDb,
  latestDatasetVersion as nasiLatestDatasetVersion,
  listAllDatasetAnswers as nasiListAllDatasetAnswers,
  listDatasetVersionsSummary as nasiListDatasetVersionsSummary,
  loadDatasetAnswers as nasiLoadDatasetAnswers,
  loadDatasetVersionCompletedAt as nasiLoadDatasetVersionCompletedAt,
  loadMemory as nasiLoadMemory,
  markDatasetVersionComplete as nasiMarkDatasetVersionComplete,
  saveDatasetAnswer as nasiSaveDatasetAnswer,
  saveMemory as nasiSaveMemory,
  noteHeader,
  setActiveStorePath
} from "@kaja/nasi"
import { file, TOML, write } from "bun"
import { getConfigPath, invalidateConfigCache, readConfigLoose } from "../config/config"
import { getPaths } from "../paths"

export { type DatasetAnswer, forgetNotes, noteHeader }

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

export async function getDb() {
  const dbPath = await resolveMemoryDbPath()
  setActiveStorePath(dbPath)
  await persistDbPathIfMissing(dbPath)
  return nasiGetDb()
}

export async function loadMemory() {
  await getDb()
  return nasiLoadMemory()
}

export async function saveMemory(store: Parameters<typeof nasiSaveMemory>[0]) {
  await getDb()
  return nasiSaveMemory(store)
}

export async function latestDatasetVersion(...args: Parameters<typeof nasiLatestDatasetVersion>) {
  await getDb()
  return nasiLatestDatasetVersion(...args)
}

export async function listAllDatasetAnswers(...args: Parameters<typeof nasiListAllDatasetAnswers>) {
  await getDb()
  return nasiListAllDatasetAnswers(...args)
}

export async function listDatasetVersionsSummary(...args: Parameters<typeof nasiListDatasetVersionsSummary>) {
  await getDb()
  return nasiListDatasetVersionsSummary(...args)
}

export async function loadDatasetAnswers(...args: Parameters<typeof nasiLoadDatasetAnswers>) {
  await getDb()
  return nasiLoadDatasetAnswers(...args)
}

export async function loadDatasetVersionCompletedAt(...args: Parameters<typeof nasiLoadDatasetVersionCompletedAt>) {
  await getDb()
  return nasiLoadDatasetVersionCompletedAt(...args)
}

export async function markDatasetVersionComplete(...args: Parameters<typeof nasiMarkDatasetVersionComplete>) {
  await getDb()
  return nasiMarkDatasetVersionComplete(...args)
}

export async function saveDatasetAnswer(...args: Parameters<typeof nasiSaveDatasetAnswer>) {
  await getDb()
  return nasiSaveDatasetAnswer(...args)
}
