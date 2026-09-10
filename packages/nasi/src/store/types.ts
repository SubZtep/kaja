import type { MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"

export type DatasetAnswer = {
  field: string
  value: string
  answeredAt: string
}

export type SessionWrite = {
  persona: string
  model: string
  owner: string | null
  session: unknown
  events: unknown[]
}

export type DatasetVersionSummary = {
  topic: string
  owner: string | null
  version: number
  answeredCount: number
  completedAt: string | undefined
}

/** Persistence for sessions, memory notes, and dataset answers. Hosts inject an implementation. */
export type NasiStore = {
  createSession(data: SessionWrite & { title: string }): Promise<string>
  updateSession(id: string, data: SessionWrite): Promise<void>
  loadSession(id: string): Promise<PersistedSession | undefined>
  loadLatestSession(owner: string | null): Promise<PersistedSession | undefined>
  deleteSession(id: string): Promise<boolean>
  listSessions(): Promise<SessionMeta[]>
  loadPromptHistory(limit?: number): Promise<string[]>

  loadMemory(owner: string | null): Promise<MemoryStore>
  saveMemory(owner: string | null, memory: MemoryStore): Promise<void>

  latestDatasetVersion(topic: string, owner: string | null): Promise<number>
  loadDatasetAnswers(topic: string, owner: string | null, version: number): Promise<DatasetAnswer[]>
  saveDatasetAnswer(topic: string, owner: string | null, version: number, field: string, value: string): Promise<void>
  markDatasetVersionComplete(topic: string, owner: string | null, version: number): Promise<void>
  loadDatasetVersionCompletedAt(topic: string, owner: string | null, version: number): Promise<string | undefined>
  listDatasetVersionsSummary(): Promise<DatasetVersionSummary[]>
  listAllDatasetAnswers(): Promise<(DatasetAnswer & { topic: string; owner: string | null; version: number })[]>
}
