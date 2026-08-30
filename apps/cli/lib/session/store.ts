import {
  createSessionRow as nasiCreate,
  deleteSessionRow as nasiDelete,
  loadPromptHistory as nasiHistory,
  loadLatestSessionRow as nasiLatest,
  loadLatestSessionRowForOwner as nasiLatestOwner,
  listSessions as nasiList,
  loadSessionRow as nasiLoad,
  updateSessionRow as nasiUpdate
} from "@kaja/nasi"
import { getDb } from "../memory/store"

export async function createSessionRow(data: Parameters<typeof nasiCreate>[0]): Promise<string> {
  await getDb()
  return nasiCreate(data)
}

export async function updateSessionRow(id: string, data: Parameters<typeof nasiUpdate>[1]) {
  await getDb()
  return nasiUpdate(id, data)
}

export async function loadSessionRow(id: string) {
  await getDb()
  return nasiLoad(id)
}

export async function loadLatestSessionRow() {
  await getDb()
  return nasiLatest()
}

export async function loadLatestSessionRowForOwner(owner: string) {
  await getDb()
  return nasiLatestOwner(owner)
}

export async function deleteSessionRow(id: string) {
  await getDb()
  return nasiDelete(id)
}

export async function listSessions() {
  await getDb()
  return nasiList()
}

export async function loadPromptHistory(limit = 100) {
  await getDb()
  return nasiHistory(limit)
}
