import type { MemoryNote, MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
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
  /** Writes the note under `key`, replacing the one stored there; every other note stays as it is. */
  saveNote(owner: string | null, key: string, note: MemoryNote): Promise<void>
  deleteNotes(owner: string | null, keys: string[]): Promise<void>
  /** Counts one more use of each of `keys` and stamps it used now. */
  touchNotes(owner: string | null, keys: string[]): Promise<void>

  latestDatasetVersion(topic: string, owner: string | null): Promise<number>
  loadDatasetAnswers(topic: string, owner: string | null, version: number): Promise<DatasetAnswer[]>
  saveDatasetAnswer(topic: string, owner: string | null, version: number, field: string, value: string): Promise<void>
  /** Opens `version` before it has an answer, so the next answers land in it and the one before stays as it is. */
  startDatasetVersion(topic: string, owner: string | null, version: number): Promise<void>
  /** Stamps `version` complete now, replacing the time it was opened at by {@link startDatasetVersion}. */
  markDatasetVersionComplete(topic: string, owner: string | null, version: number): Promise<void>
  loadDatasetVersionCompletedAt(topic: string, owner: string | null, version: number): Promise<string | undefined>
}
