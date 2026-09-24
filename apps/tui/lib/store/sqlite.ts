import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import {
  clearTelemetry,
  joinConversation,
  type MessageRow,
  type NasiStore,
  type PendingKind,
  type SessionWrite,
  splitConversation
} from "@kaja/nasi"
import type { MemoryNote, MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { PersistedSessionSchema } from "@kaja/schema/store"

function ownerKey(owner: string | null): string {
  return owner ?? ""
}

// Pre-existing `notes` tables predate the `owner` column (all rows were implicitly local-owner). Add it in place so upgraded installs keep their notes instead of losing them to the new PRIMARY KEY.
function migrateNotesOwnerColumn(db: Database) {
  const columns = db.query("PRAGMA table_info(notes)").all() as { name: string }[]
  if (columns.length === 0 || columns.some(c => c.name === "owner")) return
  db.run(`ALTER TABLE notes ADD COLUMN owner TEXT NOT NULL DEFAULT ''`)
}

// Sessions used to be one row holding the whole conversation as two JSON blobs, then rows without telemetry; they are dropped, not converted.
function dropLegacySessions(db: Database) {
  const hasColumn = (table: string, column: string) =>
    (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(c => c.name === column)
  const blobs = hasColumn("sessions", "session")
  const noTelemetry = hasColumn("messages", "toolCallId") && !hasColumn("messages", "finishReason")
  if (!blobs && !noTelemetry) return
  for (const table of ["model_calls", "session_summaries", "tool_calls", "session_events", "messages", "sessions"])
    db.run(`DROP TABLE IF EXISTS ${table}`)
}

// tool_calls from before tool results could be condensed lack resultSummary; add it in place, keeping the sessions.
function migrateToolCallSummaryColumn(db: Database) {
  const columns = db.query("PRAGMA table_info(tool_calls)").all() as { name: string }[]
  if (columns.length === 0 || columns.some(c => c.name === "resultSummary")) return
  db.run("ALTER TABLE tool_calls ADD COLUMN resultSummary TEXT")
}

function createSchema(db: Database) {
  migrateNotesOwnerColumn(db)
  dropLegacySessions(db)
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      owner       TEXT NOT NULL,
      key         TEXT NOT NULL,
      content     TEXT NOT NULL,
      importance  TEXT NOT NULL CHECK (importance IN ('low','medium','high')),
      tags        TEXT NOT NULL,
      sticky      INTEGER NOT NULL,
      createdAt   TEXT NOT NULL,
      lastUsedAt  TEXT NOT NULL,
      useCount    INTEGER NOT NULL,
      PRIMARY KEY (owner, key)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      createdAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL,
      persona       TEXT NOT NULL,
      model         TEXT NOT NULL,
      title         TEXT NOT NULL,
      owner         TEXT,
      systemPrompt  TEXT,
      pendingCallId TEXT,
      pendingKind   TEXT
    )
  `)
  db.run("CREATE INDEX IF NOT EXISTS sessions_updatedAt_idx ON sessions (updatedAt DESC)")
  db.run("CREATE INDEX IF NOT EXISTS sessions_owner_updatedAt_idx ON sessions (owner, updatedAt DESC)")
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      sessionId  TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
      seq        INTEGER NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT,
      parts      TEXT,
      reasoning  TEXT,
      toolCallId TEXT,
      persona    TEXT,
      model      TEXT,
      promptTokens     INTEGER,
      completionTokens INTEGER,
      latencyMs        INTEGER,
      finishReason     TEXT,
      createdAt  TEXT NOT NULL,
      UNIQUE (sessionId, seq)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id              TEXT PRIMARY KEY,
      messageId       TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
      position        INTEGER NOT NULL,
      callId          TEXT NOT NULL,
      name            TEXT NOT NULL,
      arguments       TEXT NOT NULL,
      resultMessageId TEXT REFERENCES messages (id) ON DELETE SET NULL,
      status          TEXT CHECK (status IN ('ok','error','declined','skipped')),
      durationMs      INTEGER,
      approval        TEXT CHECK (approval IN ('approved','declined')),
      resultSummary   TEXT,
      UNIQUE (messageId, position)
    )
  `)
  db.run("CREATE INDEX IF NOT EXISTS tool_calls_name_idx ON tool_calls (name)")
  migrateToolCallSummaryColumn(db)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_events (
      sessionId TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
      seq       INTEGER NOT NULL,
      type      TEXT NOT NULL,
      payload   TEXT NOT NULL,
      PRIMARY KEY (sessionId, seq)
    )
  `)
  db.run("CREATE INDEX IF NOT EXISTS session_events_type_idx ON session_events (type, sessionId, seq)")
  // One row per compaction: the model is sent the latest summary in place of the messages before summaryFrom.
  db.run(`
    CREATE TABLE IF NOT EXISTS session_summaries (
      sessionId   TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
      summaryFrom INTEGER NOT NULL,
      summary     TEXT NOT NULL,
      createdAt   TEXT NOT NULL,
      PRIMARY KEY (sessionId, summaryFrom)
    )
  `)
  // Model calls besides the conversation's rounds (summaries for compaction, condensing, the summarize tool), for their tokens.
  db.run(`
    CREATE TABLE IF NOT EXISTS model_calls (
      sessionId        TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
      kind             TEXT NOT NULL CHECK (kind IN ('compact','condense','summarize')),
      model            TEXT NOT NULL,
      promptTokens     INTEGER,
      completionTokens INTEGER,
      latencyMs        INTEGER NOT NULL,
      createdAt        TEXT NOT NULL
    )
  `)
  db.run("CREATE INDEX IF NOT EXISTS model_calls_session_idx ON model_calls (sessionId)")
  db.run(`
    CREATE TABLE IF NOT EXISTS dataset_answers (
      topic      TEXT NOT NULL,
      owner      TEXT NOT NULL,
      version    INTEGER NOT NULL,
      field      TEXT NOT NULL,
      value      TEXT NOT NULL,
      answeredAt TEXT NOT NULL,
      PRIMARY KEY (topic, owner, version, field)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS dataset_versions (
      topic       TEXT NOT NULL,
      owner       TEXT NOT NULL,
      version     INTEGER NOT NULL,
      completedAt TEXT NOT NULL,
      PRIMARY KEY (topic, owner, version)
    )
  `)
}

function openDb(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath, { create: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA foreign_keys = ON")
  createSchema(db)
  return db
}

type SessionRow = Omit<PersistedSession, "session" | "events"> & {
  systemPrompt: string | null
  pendingCallId: string | null
  pendingKind: PendingKind | null
}
const SESSION_COLUMNS =
  "id, createdAt, updatedAt, persona, model, title, owner, systemPrompt, pendingCallId, pendingKind"

function noteParams(key: string, note: MemoryNote) {
  return {
    $key: key,
    $content: note.content,
    $importance: note.importance,
    $tags: JSON.stringify(note.tags),
    $sticky: note.sticky ? 1 : 0,
    $createdAt: note.createdAt,
    $lastUsedAt: note.lastUsedAt,
    $useCount: note.useCount
  }
}

type MessageDbRow = {
  role: string
  content: string | null
  parts: string | null
  reasoning: string | null
  toolCallId: string | null
}

/** Local CLI persistence: one sqlite file (sessions, notes, datasets). */
export function createSqliteStore(dbPath: string): NasiStore {
  const db = openDb(dbPath)

  function count(table: "messages" | "session_events", sessionId: string): number {
    const row = db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE sessionId = $id`).get({ $id: sessionId }) as {
      n: number
    }
    return row.n
  }

  function insertMessage(sessionId: string, seq: number, row: MessageRow, createdAt: string) {
    const id = Bun.randomUUIDv7()
    db.query(
      `INSERT INTO messages (id, sessionId, seq, role, content, parts, reasoning, toolCallId, persona, model,
                             promptTokens, completionTokens, latencyMs, finishReason, createdAt)
       VALUES ($id, $sessionId, $seq, $role, $content, $parts, $reasoning, $toolCallId, $persona, $model,
               $promptTokens, $completionTokens, $latencyMs, $finishReason, $createdAt)`
    ).run({
      $persona: row.step?.persona ?? null,
      $model: row.step?.model ?? null,
      $promptTokens: row.step?.promptTokens ?? null,
      $completionTokens: row.step?.completionTokens ?? null,
      $latencyMs: row.step?.latencyMs ?? null,
      $finishReason: row.step?.finishReason ?? null,
      $id: id,
      $sessionId: sessionId,
      $seq: seq,
      $role: row.role,
      $content: row.content,
      $parts: row.parts ? JSON.stringify(row.parts) : null,
      $reasoning: row.reasoning,
      $toolCallId: row.toolCallId,
      $createdAt: createdAt
    })
    row.toolCalls.forEach((call, position) => {
      db.query(
        `INSERT INTO tool_calls (id, messageId, position, callId, name, arguments)
         VALUES ($id, $messageId, $position, $callId, $name, $arguments)`
      ).run({
        $id: Bun.randomUUIDv7(),
        $messageId: id,
        $position: position,
        $callId: call.callId,
        $name: call.name,
        $arguments: call.arguments
      })
    })
    if (row.role === "tool" && row.toolCallId) {
      db.query(
        `UPDATE tool_calls SET resultMessageId = $id
         WHERE callId = $callId AND messageId IN (SELECT id FROM messages WHERE sessionId = $sessionId)`
      ).run({ $id: id, $callId: row.toolCallId, $sessionId: sessionId })
    }
  }

  // The conversation is append-only apart from the system prompt, so a save writes just the rows past what's stored.
  const saveConversation = db.transaction((id: string, data: SessionWrite) => {
    const {
      systemPrompt,
      pending,
      messages,
      summary,
      toolSummaries,
      calls = [],
      modelCalls = []
    } = splitConversation(data.session)
    db.query(
      "UPDATE sessions SET systemPrompt = $systemPrompt, pendingCallId = $callId, pendingKind = $kind WHERE id = $id"
    ).run({
      $id: id,
      $systemPrompt: systemPrompt,
      $callId: pending?.callId ?? null,
      $kind: pending?.kind ?? null
    })
    const now = new Date().toISOString()
    const storedMessages = count("messages", id)
    messages.slice(storedMessages).forEach((row, i) => insertMessage(id, storedMessages + i, row, now))
    for (const [callId, text] of Object.entries(toolSummaries)) {
      db.query(
        `UPDATE tool_calls SET resultSummary = $text
         WHERE callId = $callId AND resultSummary IS NULL AND messageId IN (SELECT id FROM messages WHERE sessionId = $id)`
      ).run({ $id: id, $callId: callId, $text: text })
    }
    // Each compaction summarises past a later message, so a summary already stored is never written twice.
    if (summary) {
      db.query(
        "INSERT OR IGNORE INTO session_summaries (sessionId, summaryFrom, summary, createdAt) VALUES ($id, $from, $text, $now)"
      ).run({ $id: id, $from: summary.from, $text: summary.text, $now: now })
    }
    const storedEvents = count("session_events", id)
    data.events.slice(storedEvents).forEach((event, i) => {
      db.query("INSERT INTO session_events (sessionId, seq, type, payload) VALUES ($id, $seq, $type, $payload)").run({
        $id: id,
        $seq: storedEvents + i,
        $type: (event as { type: string }).type,
        $payload: JSON.stringify(event)
      })
    })
    for (const { callId, status, approval, durationMs } of calls) {
      db.query(
        `UPDATE tool_calls
         SET status = COALESCE($status, status), approval = COALESCE($approval, approval), durationMs = COALESCE($durationMs, durationMs)
         WHERE callId = $callId AND messageId IN (SELECT id FROM messages WHERE sessionId = $id)`
      ).run({
        $id: id,
        $callId: callId,
        $status: status ?? null,
        $approval: approval ?? null,
        $durationMs: durationMs ?? null
      })
    }
    for (const call of modelCalls) {
      db.query(
        `INSERT INTO model_calls (sessionId, kind, model, promptTokens, completionTokens, latencyMs, createdAt)
         VALUES ($id, $kind, $model, $promptTokens, $completionTokens, $latencyMs, $now)`
      ).run({
        $id: id,
        $kind: call.kind,
        $model: call.model,
        $promptTokens: call.promptTokens ?? null,
        $completionTokens: call.completionTokens ?? null,
        $latencyMs: call.latencyMs,
        $now: now
      })
    }
  })

  function hydrate(row: SessionRow): PersistedSession | undefined {
    try {
      const messageRows = db
        .query("SELECT role, content, parts, reasoning, toolCallId FROM messages WHERE sessionId = $id ORDER BY seq")
        .all({ $id: row.id }) as MessageDbRow[]
      const callRows = db
        .query(
          `SELECT m.seq AS seq, tc.callId AS callId, tc.name AS name, tc.arguments AS arguments,
                  tc.resultSummary AS resultSummary
           FROM tool_calls tc JOIN messages m ON m.id = tc.messageId
           WHERE m.sessionId = $id ORDER BY m.seq, tc.position`
        )
        .all({ $id: row.id }) as {
        seq: number
        callId: string
        name: string
        arguments: string
        resultSummary: string | null
      }[]
      const callsBySeq = Map.groupBy(callRows, call => call.seq)
      const eventRows = db
        .query("SELECT payload FROM session_events WHERE sessionId = $id ORDER BY seq")
        .all({ $id: row.id }) as { payload: string }[]
      const latest = db
        .query(
          "SELECT summary, summaryFrom FROM session_summaries WHERE sessionId = $id ORDER BY summaryFrom DESC LIMIT 1"
        )
        .get({ $id: row.id }) as { summary: string; summaryFrom: number } | null
      const parsed = PersistedSessionSchema.safeParse({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        persona: row.persona,
        model: row.model,
        title: row.title,
        owner: row.owner,
        session: joinConversation({
          systemPrompt: row.systemPrompt,
          pending: row.pendingCallId && row.pendingKind ? { callId: row.pendingCallId, kind: row.pendingKind } : null,
          summary: latest ? { text: latest.summary, from: latest.summaryFrom } : null,
          toolSummaries: Object.fromEntries(
            callRows.flatMap(call => (call.resultSummary !== null ? [[call.callId, call.resultSummary]] : []))
          ),
          messages: messageRows.map((message, seq) => ({
            role: message.role,
            content: message.content,
            parts: message.parts ? JSON.parse(message.parts) : null,
            reasoning: message.reasoning,
            toolCallId: message.toolCallId,
            toolCalls: (callsBySeq.get(seq) ?? []).map(({ callId, name, arguments: args }) => ({
              callId,
              name,
              arguments: args
            }))
          }))
        }),
        events: eventRows.map(event => JSON.parse(event.payload))
      })
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }

  return {
    async createSession(data: SessionWrite & { title: string }) {
      const now = new Date().toISOString()
      const id = Bun.randomUUIDv7()
      db.transaction(() => {
        db.query(`
          INSERT INTO sessions (id, createdAt, updatedAt, persona, model, title, owner)
          VALUES ($id, $createdAt, $updatedAt, $persona, $model, $title, $owner)
        `).run({
          $id: id,
          $createdAt: now,
          $updatedAt: now,
          $persona: data.persona,
          $model: data.model,
          $title: data.title,
          $owner: data.owner
        })
        saveConversation(id, data)
      })()
      clearTelemetry(data.session)
      return id
    },

    async updateSession(id, data) {
      db.transaction(() => {
        const { changes } = db
          .query("UPDATE sessions SET updatedAt = $updatedAt, persona = $persona, model = $model WHERE id = $id")
          .run({ $id: id, $updatedAt: new Date().toISOString(), $persona: data.persona, $model: data.model })
        if (changes > 0) saveConversation(id, data)
      })()
      clearTelemetry(data.session)
    },

    async loadSession(id) {
      const row = db
        .query(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = $id`)
        .get({ $id: id }) as SessionRow | null
      return row ? hydrate(row) : undefined
    },

    async loadLatestSession(owner) {
      const row =
        owner === null
          ? (db
              .query(
                `SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner IS NULL ORDER BY updatedAt DESC, id DESC LIMIT 1`
              )
              .get() as SessionRow | null)
          : (db
              .query(
                `SELECT ${SESSION_COLUMNS} FROM sessions WHERE owner = $owner ORDER BY updatedAt DESC, id DESC LIMIT 1`
              )
              .get({ $owner: owner }) as SessionRow | null)
      return row ? hydrate(row) : undefined
    },

    async deleteSession(id) {
      return db.query("DELETE FROM sessions WHERE id = $id").run({ $id: id }).changes > 0
    },

    async listSessions(): Promise<SessionMeta[]> {
      return db
        .query(
          "SELECT id, createdAt, updatedAt, persona, model, title, owner FROM sessions ORDER BY updatedAt DESC, id DESC"
        )
        .all() as SessionMeta[]
    },

    async loadPromptHistory(limit = 100) {
      const rows = db
        .query(`
          SELECT e.payload ->> 'text' AS text
          FROM session_events AS e JOIN sessions AS s ON s.id = e.sessionId
          WHERE e.type = 'user'
          ORDER BY s.updatedAt DESC, s.id DESC, e.seq DESC
          LIMIT $limit
        `)
        .all({ $limit: limit }) as { text: unknown }[]
      const prompts: string[] = []
      for (const row of rows) {
        if (typeof row.text !== "string" || row.text.length === 0) continue
        if (prompts.at(-1) === row.text) continue
        prompts.push(row.text)
      }
      return prompts
    },

    async loadMemory(owner) {
      const rows = db
        .query(
          "SELECT key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount FROM notes WHERE owner = $owner"
        )
        .all({ $owner: ownerKey(owner) }) as {
        key: string
        content: string
        importance: string
        tags: string
        sticky: number
        createdAt: string
        lastUsedAt: string
        useCount: number
      }[]
      const store: MemoryStore = {}
      for (const row of rows) {
        store[row.key] = {
          content: row.content,
          importance: row.importance as MemoryNote["importance"],
          tags: JSON.parse(row.tags),
          sticky: row.sticky === 1,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
          useCount: row.useCount
        }
      }
      return store
    },

    async saveMemory(owner, store) {
      const insert = db.query(`
        INSERT INTO notes (owner, key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount)
        VALUES ($owner, $key, $content, $importance, $tags, $sticky, $createdAt, $lastUsedAt, $useCount)
      `)
      const deleteOwned = db.query("DELETE FROM notes WHERE owner = $owner")
      const ownerParam = ownerKey(owner)
      db.transaction(() => {
        deleteOwned.run({ $owner: ownerParam })
        for (const [key, note] of Object.entries(store)) insert.run({ $owner: ownerParam, ...noteParams(key, note) })
      })()
    },

    async latestDatasetVersion(topic, owner) {
      const row = db
        .query(
          `SELECT MAX(version) AS version FROM (
             SELECT version FROM dataset_answers WHERE topic = $topic AND owner = $owner
             UNION ALL
             SELECT version FROM dataset_versions WHERE topic = $topic AND owner = $owner
           )`
        )
        .get({ $topic: topic, $owner: ownerKey(owner) }) as { version: number | null } | null
      return row?.version ?? 0
    },

    async loadDatasetAnswers(topic, owner, version) {
      return db
        .query(
          `SELECT field, value, answeredAt FROM dataset_answers
           WHERE topic = $topic AND owner = $owner AND version = $version
           ORDER BY answeredAt ASC`
        )
        .all({ $topic: topic, $owner: ownerKey(owner), $version: version }) as {
        field: string
        value: string
        answeredAt: string
      }[]
    },

    async saveDatasetAnswer(topic, owner, version, field, value) {
      db.query(
        `INSERT INTO dataset_answers (topic, owner, version, field, value, answeredAt)
         VALUES ($topic, $owner, $version, $field, $value, $answeredAt)
         ON CONFLICT(topic, owner, version, field) DO UPDATE SET value = excluded.value, answeredAt = excluded.answeredAt`
      ).run({
        $topic: topic,
        $owner: ownerKey(owner),
        $version: version,
        $field: field,
        $value: value,
        $answeredAt: new Date().toISOString()
      })
    },

    async markDatasetVersionComplete(topic, owner, version) {
      db.query(
        `INSERT OR IGNORE INTO dataset_versions (topic, owner, version, completedAt)
         VALUES ($topic, $owner, $version, $completedAt)`
      ).run({
        $topic: topic,
        $owner: ownerKey(owner),
        $version: version,
        $completedAt: new Date().toISOString()
      })
    },

    async loadDatasetVersionCompletedAt(topic, owner, version) {
      const row = db
        .query(
          "SELECT completedAt FROM dataset_versions WHERE topic = $topic AND owner = $owner AND version = $version"
        )
        .get({ $topic: topic, $owner: ownerKey(owner), $version: version }) as { completedAt: string } | null
      return row?.completedAt
    }
  }
}
