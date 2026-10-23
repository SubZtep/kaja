import type { MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import type { SessionImages } from "./images"

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
  /** The rendered timeline; append-only, so a save writes the events past what's stored. */
  events: unknown[]
}

/** Persistence for sessions, memory notes, and dataset answers. Hosts inject an implementation. */
export type NasiStore = {
  /** Saves a new session under its own id (`Session.id`, see `sessionIdOf`) and returns it. */
  createSession(data: SessionWrite & { title: string }): Promise<string>
  updateSession(id: string, data: SessionWrite): Promise<void>
  loadSession(id: string): Promise<PersistedSession | undefined>
  loadLatestSession(owner: string | null): Promise<PersistedSession | undefined>
  deleteSession(id: string): Promise<boolean>
  listSessions(): Promise<SessionMeta[]>
  /** Where a session's images are kept, from the moment they arrive (the session needn't be saved yet). */
  images(sessionId: string): SessionImages
  loadPromptHistory(limit?: number): Promise<string[]>

  loadMemory(owner: string | null): Promise<MemoryStore>
  saveMemory(owner: string | null, memory: MemoryStore): Promise<void>

  latestDatasetVersion(topic: string, owner: string | null): Promise<number>
  loadDatasetAnswers(topic: string, owner: string | null, version: number): Promise<DatasetAnswer[]>
  saveDatasetAnswer(topic: string, owner: string | null, version: number, field: string, value: string): Promise<void>
  markDatasetVersionComplete(topic: string, owner: string | null, version: number): Promise<void>
  loadDatasetVersionCompletedAt(topic: string, owner: string | null, version: number): Promise<string | undefined>
}
