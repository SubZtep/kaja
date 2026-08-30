import { join } from "node:path"
import {
  type DatasetAnswer,
  forgetNotes,
  latestDatasetVersion,
  listAllDatasetAnswers,
  listDatasetVersionsSummary,
  loadDatasetAnswers,
  loadDatasetVersionCompletedAt,
  markDatasetVersionComplete,
  getDb as nasiGetDb,
  loadMemory as nasiLoadMemory,
  saveMemory as nasiSaveMemory,
  noteHeader,
  saveDatasetAnswer,
  setActiveStorePath
} from "@kaja/nasi"
import { file, write } from "bun"
import { stringify } from "smol-toml"
import { getConfigPath, invalidateConfigCache, readConfigLoose } from "../config/config"
import { getPaths } from "../paths"

export {
  type DatasetAnswer,
  forgetNotes,
  latestDatasetVersion,
  listAllDatasetAnswers,
  listDatasetVersionsSummary,
  loadDatasetAnswers,
  loadDatasetVersionCompletedAt,
  markDatasetVersionComplete,
  noteHeader,
  saveDatasetAnswer
}

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
    await write(file(configPath), stringify({ ...loose, memory: { ...loose.memory, dbPath } }))
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
