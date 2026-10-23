import type { MemoryNote, MemoryStore, PersistedSession, SessionMeta } from "@kaja/schema/store"
import { channelOf, PersistedSessionSchema } from "@kaja/schema/store"
import type { SQL } from "bun"
import { imageLabel, relabeledParts } from "../agent/describe"
import { warn } from "../warn"
import {
  IMAGE_REF_PREFIX,
  type ImageRow,
  type ImageRows,
  objectSessionImages,
  sessionImagePrefix,
  storeInlineImages
} from "./images"
import type { ObjectStore } from "./objects"
import {
  clearTelemetry,
  joinConversation,
  type MessageRow,
  type PendingKind,
  sessionIdOf,
  splitConversation
} from "./rows"
import { iso, jsonParam, pgText, readBool, readJson } from "./sql-codec"
import type { DatasetAnswer, NasiStore, SessionWrite } from "./types"

export type SqlStoreOptions = {
  /** Every statement is scoped to this account; the local file has one (`LOCAL_USER_ID`). */
  userId: string
  /** The channel of a session whose owner isn't `telegram:…` or `widget:…`. */
  defaultChannel: "web" | "local"
  /** Where the images' bytes are kept: the cloud's bucket, or the folder beside the local database. */
  objects: ObjectStore
  /** A session's image objects' prefix; `images/<userId>/<sessionId>` unless the host lays them out otherwise. */
  imagePrefix?: (sessionId: string) => string
  /** Applied to each timeline event before it's written (the TUI strips a tool image's absolute path). */
  mapEventOut?: (event: unknown) => unknown
  /** Applied to each timeline event on load (the TUI puts the path back). */
  mapEventIn?: (event: unknown) => unknown
  /** A stored session that no longer validates; it then loads as missing. Defaults to `warn`. */
  onInvalid?: (sessionId: string, error: unknown) => void
}

/** The id of the one account a local database holds; never a row in the cloud's `"user"` table. */
export const LOCAL_USER_ID = "00000000-0000-7000-8000-000000000001"

const ownerKey = (owner: string | null) => owner ?? ""
const now = () => new Date().toISOString()

type SessionRow = {
  id: string
  created_at: Date | string
  updated_at: Date | string
  persona: string
  model: string
  title: string
  owner: string | null
  system_prompt: string | null
  pending_call_id: string | null
  pending_kind: PendingKind | null
  granted_tools: unknown
}

type ImageDbRow = {
  id: string
  mime_type: string
  width: number
  height: number
  bytes: number
  source_url: string | null
  alt: string | null
  title: string | null
  file_name: string | null
  description: string | null
}

function rowToImage(row: ImageDbRow): ImageRow & { description?: string } {
  const image: ImageRow & { description?: string } = {
    id: row.id,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    bytes: row.bytes
  }
  const fields = { url: row.source_url, alt: row.alt, title: row.title, fileName: row.file_name }
  const source = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null))
  if (Object.keys(source).length) image.source = source
  if (row.description !== null) image.description = row.description
  return image
}

// Writes go through `sql.begin` even alone: on SQLite a plain query would run inside another save's open transaction
function imageRows(sql: SQL, userId: string, sessionId: string): ImageRows {
  return {
    async add(row) {
      const { url, alt, title, fileName } = row.source ?? {}
      // A later arrival fills only what the first left unset
      await sql.begin(
        tx => tx`
          INSERT INTO nasi_image (session_id, user_id, id, mime_type, width, height, bytes,
                                  source_url, alt, title, file_name, created_at)
          VALUES (${sessionId}, ${userId}, ${row.id}, ${row.mimeType}, ${row.width}, ${row.height}, ${row.bytes},
                  ${url ?? null}, ${alt ?? null}, ${title ?? null}, ${fileName ?? null}, ${now()})
          ON CONFLICT (session_id, id) DO UPDATE SET
            source_url = COALESCE(nasi_image.source_url, excluded.source_url),
            alt = COALESCE(nasi_image.alt, excluded.alt),
            title = COALESCE(nasi_image.title, excluded.title),
            file_name = COALESCE(nasi_image.file_name, excluded.file_name)
          WHERE nasi_image.user_id = excluded.user_id`
      )
    },
    async get(id) {
      const [row] = await sql<ImageDbRow[]>`
        SELECT id, mime_type, width, height, bytes, source_url, alt, title, file_name, description FROM nasi_image
        WHERE session_id = ${sessionId} AND user_id = ${userId} AND id = ${id}`
      return row && rowToImage(row)
    },
    async describe(id, description, model) {
      await sql.begin(
        tx => tx`
          UPDATE nasi_image SET description = ${description}, description_model = ${model}, described_at = ${now()}
          WHERE session_id = ${sessionId} AND user_id = ${userId} AND id = ${id}`
      )
    },
    async clear() {
      await sql.begin(tx => tx`DELETE FROM nasi_image WHERE session_id = ${sessionId} AND user_id = ${userId}`)
    }
  }
}

async function insertMessage(tx: SQL, sessionId: string, seq: number, row: MessageRow, createdAt: string) {
  const id = Bun.randomUUIDv7()
  const step = row.step
  await tx`
    INSERT INTO nasi_message (id, session_id, seq, role, content, parts, reasoning, tool_call_id,
                              persona, model, prompt_tokens, completion_tokens, latency_ms, finish_reason, created_at)
    VALUES (${id}, ${sessionId}, ${seq}, ${row.role}, ${pgText(row.content)}, ${jsonParam(tx, row.parts)},
            ${pgText(row.reasoning)}, ${row.toolCallId}, ${step?.persona ?? null}, ${step?.model ?? null},
            ${step?.promptTokens ?? null}, ${step?.completionTokens ?? null}, ${step?.latencyMs ?? null},
            ${step?.finishReason ?? null}, ${createdAt})`
  for (const [position, call] of row.toolCalls.entries()) {
    await tx`
      INSERT INTO nasi_tool_call (id, message_id, position, call_id, name, arguments)
      VALUES (${Bun.randomUUIDv7()}, ${id}, ${position}, ${call.callId}, ${call.name}, ${pgText(call.arguments)})`
  }
  if (row.role === "tool" && row.toolCallId) {
    await tx`
      UPDATE nasi_tool_call SET result_message_id = ${id}
      WHERE call_id = ${row.toolCallId} AND message_id IN (SELECT id FROM nasi_message WHERE session_id = ${sessionId})`
  }
}

const countOf = async (query: Promise<{ n: number | string }[]>) => Number((await query)[0]?.n ?? 0)

/** Persistence over a `Bun.SQL` client: the same statements on SQLite (the TUI) and Postgres (the API). */
export function createSqlStore(sql: SQL, opts: SqlStoreOptions): NasiStore {
  const { userId } = opts
  const mapOut = opts.mapEventOut ?? (event => event)
  const mapIn = opts.mapEventIn ?? (event => event)
  const prefix = opts.imagePrefix ?? ((sessionId: string) => sessionImagePrefix(sessionId, userId))
  const sessionImages = (sessionId: string) =>
    objectSessionImages(opts.objects, prefix(sessionId), imageRows(sql, userId, sessionId))
  const channel = (owner: string | null) => (channelOf(owner) === "web" ? opts.defaultChannel : channelOf(owner))
  const onInvalid =
    opts.onInvalid ?? ((sessionId, error) => warn("Stored session failed validation", { sessionId, error }))

  // A message still holding an inline image (a run without the store) gets it stored before the transaction writes it
  async function storeInline(id: string, data: SessionWrite): Promise<SessionWrite> {
    const session = data.session as { messages?: { content?: unknown }[] }
    const messages = await Promise.all(
      (session.messages ?? []).map(async message =>
        Array.isArray(message.content)
          ? { ...message, content: await storeInlineImages(message.content, sessionImages(id)) }
          : message
      )
    )
    return { ...data, session: { ...session, messages } }
  }

  // The conversation and timeline are append-only apart from the session row, so a save writes the rows past what's stored
  async function saveConversation(tx: SQL, id: string, data: SessionWrite) {
    const {
      systemPrompt,
      pending,
      grantedTools = [],
      messages,
      summary,
      toolSummaries,
      calls = [],
      modelCalls = []
    } = splitConversation(data.session)
    const at = now()
    await tx`
      UPDATE nasi_session SET system_prompt = ${pgText(systemPrompt)}, pending_call_id = ${pending?.callId ?? null},
        pending_kind = ${pending?.kind ?? null}, granted_tools = ${tx.json(grantedTools)}
      WHERE id = ${id}`
    const storedMessages = await countOf(tx`SELECT COUNT(*) AS n FROM nasi_message WHERE session_id = ${id}`)
    for (const [i, row] of messages.slice(storedMessages).entries()) {
      await insertMessage(tx, id, storedMessages + i, row, at)
    }
    for (const [callId, text] of Object.entries(toolSummaries)) {
      await tx`
        UPDATE nasi_tool_call SET result_summary = ${pgText(text)}
        WHERE call_id = ${callId} AND result_summary IS NULL
          AND message_id IN (SELECT id FROM nasi_message WHERE session_id = ${id})`
    }
    // Each compaction summarises past a later message, so a summary already stored is never written twice
    if (summary) {
      await tx`
        INSERT INTO nasi_session_summary (session_id, summary_from, summary, created_at)
        VALUES (${id}, ${summary.from}, ${pgText(summary.text)}, ${at})
        ON CONFLICT (session_id, summary_from) DO NOTHING`
    }
    const storedEvents = await countOf(tx`SELECT COUNT(*) AS n FROM nasi_session_event WHERE session_id = ${id}`)
    for (const [i, event] of data.events.slice(storedEvents).entries()) {
      await tx`
        INSERT INTO nasi_session_event (session_id, seq, type, payload)
        VALUES (${id}, ${storedEvents + i}, ${String((event as { type?: unknown }).type)}, ${jsonParam(tx, mapOut(event))})`
    }
    for (const { callId, status, approval, durationMs } of calls) {
      await tx`
        UPDATE nasi_tool_call SET status = COALESCE(${status ?? null}, status),
          approval = COALESCE(${approval ?? null}, approval), duration_ms = COALESCE(${durationMs ?? null}, duration_ms)
        WHERE call_id = ${callId} AND message_id IN (SELECT id FROM nasi_message WHERE session_id = ${id})`
    }
    for (const call of modelCalls) {
      await tx`
        INSERT INTO nasi_model_call (id, session_id, kind, model, prompt_tokens, completion_tokens, latency_ms, created_at)
        VALUES (${Bun.randomUUIDv7()}, ${id}, ${call.kind}, ${call.model}, ${call.promptTokens ?? null},
                ${call.completionTokens ?? null}, ${call.latencyMs}, ${at})`
    }
  }

  /** Rebuilds a session from its rows (images stay refs: a model request fetches the ones it sends). */
  async function hydrate(row: SessionRow): Promise<PersistedSession | undefined> {
    const [messages, calls, summaries, events] = await Promise.all([
      sql<
        {
          role: string
          content: string | null
          parts: unknown
          reasoning: string | null
          tool_call_id: string | null
        }[]
      >`
        SELECT role, content, parts, reasoning, tool_call_id FROM nasi_message WHERE session_id = ${row.id} ORDER BY seq`,
      sql<{ seq: number; call_id: string; name: string; arguments: string; result_summary: string | null }[]>`
        SELECT m.seq AS seq, tc.call_id AS call_id, tc.name AS name, tc.arguments AS arguments,
               tc.result_summary AS result_summary
        FROM nasi_tool_call tc JOIN nasi_message m ON m.id = tc.message_id
        WHERE m.session_id = ${row.id} ORDER BY m.seq, tc.position`,
      sql<{ summary: string; summary_from: number }[]>`
        SELECT summary, summary_from FROM nasi_session_summary WHERE session_id = ${row.id}
        ORDER BY summary_from DESC LIMIT 1`,
      sql<{ payload: unknown }[]>`SELECT payload FROM nasi_session_event WHERE session_id = ${row.id} ORDER BY seq`
    ])
    const latest = summaries[0]
    const callsBySeq = Map.groupBy(calls, call => call.seq)
    try {
      const parsed = PersistedSessionSchema.safeParse({
        id: row.id,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        persona: row.persona,
        model: row.model,
        title: row.title,
        owner: row.owner,
        session: {
          id: row.id,
          ...joinConversation({
            systemPrompt: row.system_prompt,
            pending:
              row.pending_call_id && row.pending_kind ? { callId: row.pending_call_id, kind: row.pending_kind } : null,
            summary: latest ? { text: latest.summary, from: latest.summary_from } : null,
            grantedTools: readJson<string[]>(row.granted_tools),
            toolSummaries: Object.fromEntries(
              calls.flatMap(call => (call.result_summary === null ? [] : [[call.call_id, call.result_summary]]))
            ),
            messages: messages.map((message, seq) => ({
              role: message.role,
              content: message.content,
              parts: message.parts === null ? null : readJson<unknown[]>(message.parts),
              reasoning: message.reasoning,
              toolCallId: message.tool_call_id,
              toolCalls: (callsBySeq.get(seq) ?? []).map(call => ({
                callId: call.call_id,
                name: call.name,
                arguments: call.arguments
              }))
            }))
          })
        },
        events: events.map(event => mapIn(readJson(event.payload)))
      })
      if (parsed.success) return parsed.data
      onInvalid(row.id, parsed.error)
    } catch (error) {
      onInvalid(row.id, error)
    }
    return undefined
  }

  return {
    async createSession(data) {
      const id = sessionIdOf(data.session)
      const write = await storeInline(id, data)
      const at = now()
      await sql.begin(async tx => {
        await tx`
          INSERT INTO nasi_session (id, user_id, created_at, updated_at, persona, model, title, owner, channel)
          VALUES (${id}, ${userId}, ${at}, ${at}, ${data.persona}, ${data.model}, ${pgText(data.title)}, ${data.owner},
                  ${channel(data.owner)})`
        await saveConversation(tx, id, write)
      })
      clearTelemetry(data.session)
      return id
    },

    async updateSession(id, data) {
      const write = await storeInline(id, data)
      await sql.begin(async tx => {
        const result = await tx`
          UPDATE nasi_session SET updated_at = ${now()}, persona = ${data.persona}, model = ${data.model}
          WHERE id = ${id} AND user_id = ${userId}`
        if (result.affectedRows > 0) await saveConversation(tx, id, write)
      })
      clearTelemetry(data.session)
    },

    async loadSession(id) {
      const [row] = await sql<SessionRow[]>`
        SELECT id, created_at, updated_at, persona, model, title, owner, system_prompt, pending_call_id, pending_kind,
               granted_tools
        FROM nasi_session WHERE id = ${id} AND user_id = ${userId}`
      return row && hydrate(row)
    },

    async loadLatestSession(owner) {
      const [row] = await sql<SessionRow[]>`
        SELECT id, created_at, updated_at, persona, model, title, owner, system_prompt, pending_call_id, pending_kind,
               granted_tools
        FROM nasi_session WHERE user_id = ${userId} AND ${owner === null ? sql`owner IS NULL` : sql`owner = ${owner}`}
        ORDER BY updated_at DESC, id DESC LIMIT 1`
      return row && hydrate(row)
    },

    async deleteSession(id) {
      const result = await sql.begin(tx => tx`DELETE FROM nasi_session WHERE id = ${id} AND user_id = ${userId}`)
      if (!result.affectedRows) return false
      await sessionImages(id).clear()
      return true
    },

    images: sessionImages,

    async listSessions(): Promise<SessionMeta[]> {
      const rows = await sql<
        Pick<SessionRow, "id" | "created_at" | "updated_at" | "persona" | "model" | "title" | "owner">[]
      >`
        SELECT id, created_at, updated_at, persona, model, title, owner
        FROM nasi_session WHERE user_id = ${userId}
        ORDER BY updated_at DESC, id DESC`
      return rows.map(row => ({
        id: row.id,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        persona: row.persona,
        model: row.model,
        title: row.title,
        owner: row.owner
      }))
    },

    async loadPromptHistory(limit = 100) {
      const rows = await sql<{ text: string | null }[]>`
        SELECT m.content AS text
        FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
        WHERE s.user_id = ${userId} AND m.role = 'user' AND m.content IS NOT NULL
        ORDER BY s.updated_at DESC, s.id DESC, m.seq DESC
        LIMIT ${limit}`
      const prompts: string[] = []
      for (const row of rows) {
        if (typeof row.text !== "string" || row.text.length === 0) continue
        if (prompts.at(-1) === row.text) continue
        prompts.push(row.text)
      }
      return prompts
    },

    async loadMemory(owner) {
      const rows = await sql<
        {
          key: string
          content: string
          importance: MemoryNote["importance"]
          tags: unknown
          sticky: unknown
          created_at: Date | string
          last_used_at: Date | string
          use_count: number
        }[]
      >`
        SELECT key, content, importance, tags, sticky, created_at, last_used_at, use_count
        FROM nasi_note WHERE user_id = ${userId} AND owner = ${ownerKey(owner)}`
      const store: MemoryStore = {}
      for (const row of rows) {
        store[row.key] = {
          content: row.content,
          importance: row.importance,
          tags: readJson<string[]>(row.tags),
          sticky: readBool(row.sticky),
          createdAt: iso(row.created_at),
          lastUsedAt: iso(row.last_used_at),
          useCount: row.use_count
        }
      }
      return store
    },

    async saveMemory(owner, store) {
      await sql.begin(async tx => {
        await tx`DELETE FROM nasi_note WHERE user_id = ${userId} AND owner = ${ownerKey(owner)}`
        for (const [key, note] of Object.entries(store)) {
          await tx`
            INSERT INTO nasi_note (user_id, owner, key, content, importance, tags, sticky, created_at, last_used_at, use_count)
            VALUES (${userId}, ${ownerKey(owner)}, ${pgText(key)}, ${pgText(note.content)}, ${note.importance},
                    ${jsonParam(tx, note.tags)}, ${note.sticky}, ${note.createdAt}, ${note.lastUsedAt}, ${note.useCount})`
        }
      })
    },

    async latestDatasetVersion(topic, owner) {
      const [row] = await sql<{ version: number | null }[]>`
        SELECT MAX(version) AS version FROM (
          SELECT version FROM nasi_dataset_answer WHERE user_id = ${userId} AND topic = ${topic} AND owner = ${ownerKey(owner)}
          UNION ALL
          SELECT version FROM nasi_dataset_version WHERE user_id = ${userId} AND topic = ${topic} AND owner = ${ownerKey(owner)}
        ) t`
      return row?.version ?? 0
    },

    async loadDatasetAnswers(topic, owner, version) {
      const rows = await sql<{ field: string; value: string; answered_at: Date | string }[]>`
        SELECT field, value, answered_at FROM nasi_dataset_answer
        WHERE user_id = ${userId} AND topic = ${topic} AND owner = ${ownerKey(owner)} AND version = ${version}
        ORDER BY answered_at ASC`
      return rows.map((row): DatasetAnswer => ({
        field: row.field,
        value: row.value,
        answeredAt: iso(row.answered_at)
      }))
    },

    async saveDatasetAnswer(topic, owner, version, field, value) {
      await sql.begin(
        tx => tx`
          INSERT INTO nasi_dataset_answer (user_id, topic, owner, version, field, value, answered_at)
          VALUES (${userId}, ${topic}, ${ownerKey(owner)}, ${version}, ${field}, ${pgText(value)}, ${now()})
          ON CONFLICT (user_id, topic, owner, version, field)
          DO UPDATE SET value = excluded.value, answered_at = excluded.answered_at`
      )
    },

    async markDatasetVersionComplete(topic, owner, version) {
      await sql.begin(
        tx => tx`
          INSERT INTO nasi_dataset_version (user_id, topic, owner, version, completed_at)
          VALUES (${userId}, ${topic}, ${ownerKey(owner)}, ${version}, ${now()})
          ON CONFLICT (user_id, topic, owner, version) DO NOTHING`
      )
    },

    async loadDatasetVersionCompletedAt(topic, owner, version) {
      const [row] = await sql<{ completed_at: Date | string }[]>`
        SELECT completed_at FROM nasi_dataset_version
        WHERE user_id = ${userId} AND topic = ${topic} AND owner = ${ownerKey(owner)} AND version = ${version}`
      return row && iso(row.completed_at)
    }
  }
}

type DescribeUsage = { model: string; promptTokens?: number; completionTokens?: number; latencyMs: number }

/** Counts a describe try on an image, whatever came of it. */
export async function bumpDescribeAttempt(sql: SQL, userId: string, sessionId: string, imageId: string) {
  await sql.begin(
    tx => tx`
      UPDATE nasi_image SET describe_attempts = describe_attempts + 1, describe_tried_at = ${now()}
      WHERE session_id = ${sessionId} AND user_id = ${userId} AND id = ${imageId}`
  )
}

/** Records a describe call's tokens against the image's session, when that session was saved. */
export async function recordDescribeCall(sql: SQL, userId: string, sessionId: string, usage: DescribeUsage) {
  await sql.begin(
    tx => tx`
      INSERT INTO nasi_model_call (id, session_id, kind, model, prompt_tokens, completion_tokens, latency_ms, created_at)
      SELECT ${Bun.randomUUIDv7()}, ${sessionId}, 'describe', ${usage.model}, ${usage.promptTokens ?? null},
             ${usage.completionTokens ?? null}, ${usage.latencyMs}, ${now()}
      WHERE EXISTS (SELECT 1 FROM nasi_session WHERE id = ${sessionId} AND user_id = ${userId})`
  )
}

/** Keeps an image's description in its row and puts it in the image's label in the session's saved messages. */
export async function recordDescribedImage(
  sql: SQL,
  userId: string,
  image: { sessionId: string; id: string; width: number; height: number },
  description: string,
  model: string
) {
  const ref = `${IMAGE_REF_PREFIX}${image.id}`
  const label = imageLabel(ref, undefined, "").slice(0, -3)
  await sql.begin(async tx => {
    await tx`
      UPDATE nasi_image SET description = ${pgText(description)}, description_model = ${model}, described_at = ${now()}
      WHERE session_id = ${image.sessionId} AND user_id = ${userId} AND id = ${image.id}`
    const messages = await tx<{ id: string; parts: unknown }[]>`
      SELECT m.id AS id, m.parts AS parts FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
      WHERE m.session_id = ${image.sessionId} AND s.user_id = ${userId} AND m.parts IS NOT NULL`
    for (const message of messages) {
      const stored = readJson<unknown[]>(message.parts)
      if (!JSON.stringify(stored).includes(label)) continue
      const parts = relabeledParts(stored, ref, image, description)
      if (parts) await tx`UPDATE nasi_message SET parts = ${jsonParam(tx, parts)} WHERE id = ${message.id}`
    }
  })
}
