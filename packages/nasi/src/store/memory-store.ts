import type { MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { PersistedSessionSchema } from "@kaja/schema/store"
import type { DatasetAnswer, NasiStore, SessionWrite } from "./types"

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
    createSession(data: SessionWrite & { title: string }) {
      return Promise.try(() => {
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
      })
    },

    updateSession(id, data) {
      return Promise.try(() => {
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
      })
    },

    loadSession(id) {
      return Promise.try(() => {
        const row = sessions.get(id)
        return row ? parseSession(clone(row)) : undefined
      })
    },

    loadLatestSession(owner) {
      return Promise.try(() => {
        const matches = [...sessions.values()].filter(s => (s.owner ?? null) === owner)
        matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
        const row = matches[0]
        return row ? parseSession(clone(row)) : undefined
      })
    },

    deleteSession(id) {
      return Promise.try(() => {
        return sessions.delete(id)
      })
    },

    listSessions(): Promise<SessionMeta[]> {
      return Promise.try(() => {
        return [...sessions.values()]
          .map(({ session: _s, events: _e, ...meta }) => meta)
          .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      })
    },

    loadPromptHistory(limit = 100) {
      return Promise.try(() => {
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
      })
    },

    loadMemory(owner) {
      return Promise.try(() => {
        return clone(memoryByOwner.get(ownerKey(owner)) ?? {})
      })
    },

    saveMemory(owner, next) {
      return Promise.try(() => {
        memoryByOwner.set(ownerKey(owner), clone(next))
      })
    },

    latestDatasetVersion(topic, owner) {
      return Promise.try(() => {
        let max = 0
        for (const row of answers.values()) {
          if (row.topic === topic && (row.owner ?? null) === owner) max = Math.max(max, row.version)
        }
        for (const row of versions.values()) {
          if (row.topic === topic && (row.owner ?? null) === owner) max = Math.max(max, row.version)
        }
        return max
      })
    },

    loadDatasetAnswers(topic, owner, version) {
      return Promise.try(() => {
        return [...answers.values()]
          .filter(row => row.topic === topic && (row.owner ?? null) === owner && row.version === version)
          .map(({ field, value, answeredAt }) => ({ field, value, answeredAt }))
          .toSorted((a, b) => a.answeredAt.localeCompare(b.answeredAt))
      })
    },

    saveDatasetAnswer(topic, owner, version, field, value) {
      return Promise.try(() => {
        answers.set(datasetKey(topic, owner, version, field), {
          topic,
          owner,
          version,
          field,
          value,
          answeredAt: new Date().toISOString()
        })
      })
    },

    markDatasetVersionComplete(topic, owner, version) {
      return Promise.try(() => {
        const key = datasetKey(topic, owner, version)
        if (versions.has(key)) return
        versions.set(key, { topic, owner, version, completedAt: new Date().toISOString() })
      })
    },

    loadDatasetVersionCompletedAt(topic, owner, version) {
      return Promise.try(() => {
        return versions.get(datasetKey(topic, owner, version))?.completedAt
      })
    }
  }
}
