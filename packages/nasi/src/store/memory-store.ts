import type { MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { PersistedSessionSchema } from "@kaja/schema/store"
import type { DatasetAnswer, DatasetVersionSummary, NasiStore, SessionWrite } from "./types"

function ownerKey(owner: string | null): string {
  return owner ?? ""
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function parseSession(row: PersistedSession): PersistedSession | undefined {
  const parsed = PersistedSessionSchema.safeParse(row)
  return parsed.success ? parsed.data : undefined
}

function datasetKey(topic: string, owner: string | null, version: number, field?: string) {
  const base = `${topic}\0${ownerKey(owner)}\0${version}`
  return field !== undefined ? `${base}\0${field}` : base
}

/** In-memory store for tests and hosts that do not persist. */
export function createMemoryStore(): NasiStore {
  const sessions = new Map<string, PersistedSession>()
  const memoryByOwner = new Map<string, MemoryStore>()
  const answers = new Map<string, DatasetAnswer & { topic: string; owner: string | null; version: number }>()
  const versions = new Map<string, { topic: string; owner: string | null; version: number; completedAt: string }>()

  return {
    async createSession(data: SessionWrite & { title: string }) {
      const now = new Date().toISOString()
      const id = Bun.randomUUIDv7()
      sessions.set(id, {
        id,
        createdAt: now,
        updatedAt: now,
        persona: data.persona,
        model: data.model,
        title: data.title,
        owner: data.owner,
        session: clone(data.session) as PersistedSession["session"],
        events: clone(data.events) as PersistedSession["events"]
      })
      return id
    },

    async updateSession(id, data) {
      const row = sessions.get(id)
      if (!row) return
      sessions.set(id, {
        ...row,
        updatedAt: new Date().toISOString(),
        persona: data.persona,
        model: data.model,
        session: clone(data.session) as PersistedSession["session"],
        events: clone(data.events) as PersistedSession["events"]
      })
    },

    async loadSession(id) {
      const row = sessions.get(id)
      return row ? parseSession(clone(row)) : undefined
    },

    async loadLatestSession(owner) {
      const matches = [...sessions.values()].filter(s => (s.owner ?? null) === owner)
      matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      const row = matches[0]
      return row ? parseSession(clone(row)) : undefined
    },

    async deleteSession(id) {
      return sessions.delete(id)
    },

    async listSessions(): Promise<SessionMeta[]> {
      return [...sessions.values()]
        .map(({ session: _s, events: _e, ...meta }) => meta)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
    },

    async loadPromptHistory(limit = 100) {
      const rows = [...sessions.values()].toSorted(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
      )
      const prompts: string[] = []
      for (const row of rows) {
        for (let i = row.events.length - 1; i >= 0; i--) {
          const event = row.events[i] as { type?: string; text?: unknown }
          if (event?.type !== "user" || typeof event.text !== "string" || event.text.length === 0) continue
          if (prompts.at(-1) === event.text) continue
          prompts.push(event.text)
          if (prompts.length >= limit) return prompts
        }
      }
      return prompts
    },

    async loadMemory(owner) {
      return clone(memoryByOwner.get(ownerKey(owner)) ?? {})
    },

    async saveMemory(owner, next) {
      memoryByOwner.set(ownerKey(owner), clone(next))
    },

    async latestDatasetVersion(topic, owner) {
      let max = 0
      for (const row of answers.values()) {
        if (row.topic === topic && (row.owner ?? null) === owner) max = Math.max(max, row.version)
      }
      for (const row of versions.values()) {
        if (row.topic === topic && (row.owner ?? null) === owner) max = Math.max(max, row.version)
      }
      return max
    },

    async loadDatasetAnswers(topic, owner, version) {
      return [...answers.values()]
        .filter(row => row.topic === topic && (row.owner ?? null) === owner && row.version === version)
        .map(({ field, value, answeredAt }) => ({ field, value, answeredAt }))
        .toSorted((a, b) => a.answeredAt.localeCompare(b.answeredAt))
    },

    async saveDatasetAnswer(topic, owner, version, field, value) {
      answers.set(datasetKey(topic, owner, version, field), {
        topic,
        owner,
        version,
        field,
        value,
        answeredAt: new Date().toISOString()
      })
    },

    async markDatasetVersionComplete(topic, owner, version) {
      const key = datasetKey(topic, owner, version)
      if (versions.has(key)) return
      versions.set(key, { topic, owner, version, completedAt: new Date().toISOString() })
    },

    async loadDatasetVersionCompletedAt(topic, owner, version) {
      return versions.get(datasetKey(topic, owner, version))?.completedAt
    },

    async listDatasetVersionsSummary(): Promise<DatasetVersionSummary[]> {
      const grouped = new Map<string, DatasetVersionSummary>()
      for (const row of answers.values()) {
        const key = datasetKey(row.topic, row.owner, row.version)
        const current = grouped.get(key)
        if (current) current.answeredCount++
        else
          grouped.set(key, {
            topic: row.topic,
            owner: row.owner,
            version: row.version,
            answeredCount: 1,
            completedAt: versions.get(key)?.completedAt
          })
      }
      return [...grouped.values()].toSorted(
        (a, b) =>
          a.topic.localeCompare(b.topic) || ownerKey(a.owner).localeCompare(ownerKey(b.owner)) || a.version - b.version
      )
    },

    async listAllDatasetAnswers() {
      return [...answers.values()].toSorted(
        (a, b) =>
          a.topic.localeCompare(b.topic) ||
          ownerKey(a.owner).localeCompare(ownerKey(b.owner)) ||
          a.version - b.version ||
          a.answeredAt.localeCompare(b.answeredAt)
      )
    }
  }
}
