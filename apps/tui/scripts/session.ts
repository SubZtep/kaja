// Read-only dump of local CLI sessions in memory.sqlite.
//
//   bun apps/tui/scripts/session.ts list
//   bun apps/tui/scripts/session.ts dump <id>
//
// `dump` writes markdown to stdout. `<id>` may be a unique prefix.
// Terminal sessions only (empty owner). The database is never created or migrated.

import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { resolveMemoryDbPath } from "../lib/memory/store"

const USAGE = `Usage:
  bun apps/tui/scripts/session.ts list
  bun apps/tui/scripts/session.ts dump <id>

list prints terminal sessions, newest first.
dump prints markdown for one terminal session. The id may be a unique prefix.
Output is on stdout.`

type SessionRow = Record<string, unknown> & {
  id: string
  createdAt: string
  updatedAt: string
  persona: string
  model: string
  title: string
  owner: string | null
  systemPrompt: string | null
  pendingCallId: string | null
  pendingKind: string | null
}

type MessageRow = {
  id: string
  sessionId: string
  seq: number
  role: string
  content: string | null
  parts: string | null
  reasoning: string | null
  toolCallId: string | null
  persona: string | null
  model: string | null
  promptTokens: number | null
  completionTokens: number | null
  latencyMs: number | null
  finishReason: string | null
  createdAt: string
}

type ToolCallRow = {
  id: string
  messageId: string
  position: number
  callId: string
  name: string
  arguments: string
  resultMessageId: string | null
  status: string | null
  durationMs: number | null
  approval: string | null
}

type EventRow = {
  sessionId: string
  seq: number
  type: string
  payload: string
}

type NoteRow = {
  owner: string
  key: string
  content: string
  importance: string
  tags: string
  sticky: number
  createdAt: string
  lastUsedAt: string
  useCount: number
}

type AnswerRow = {
  topic: string
  owner: string
  version: number
  field: string
  value: string
  answeredAt: string
}

type VersionRow = {
  topic: string
  owner: string
  version: number
  completedAt: string
}

export type SessionListRow = {
  id: string
  updatedAt: string
  persona: string
  model: string
  title: string
  messages: number
}

/** Opens `dbPath` read-only. A missing file is an error. Nothing is created or migrated. */
export function openReadonly(dbPath: string): Database {
  if (!existsSync(dbPath)) throw new Error(`No database at ${dbPath}.`)
  const db = new Database(dbPath, { readonly: true, create: false })
  db.run("PRAGMA query_only = ON")
  return db
}

/** Terminal sessions, newest first, with a message count. */
export function listTerminalSessions(db: Database): SessionListRow[] {
  const rows = db
    .query(
      `SELECT s.id, s.updatedAt, s.persona, s.model, s.title,
              (SELECT COUNT(*) FROM messages AS m WHERE m.sessionId = s.id) AS messages
       FROM sessions AS s
       WHERE s.owner IS NULL
       ORDER BY s.updatedAt DESC, s.id DESC`
    )
    .all() as SessionListRow[]
  return rows.map(row => ({ ...row, messages: Number(row.messages) }))
}

/** Text for `list`. `dbPath` is included so the file in use is visible. */
export function formatSessionList(rows: SessionListRow[], dbPath: string): string {
  const header = `database  ${dbPath}`
  if (rows.length === 0) return `${header}\n\nNo terminal sessions.`
  const columns = ["id", "updated", "persona", "model", "messages", "title"]
  const body = rows.map(row => [row.id, row.updatedAt, row.persona, row.model, String(row.messages), row.title])
  return `${header}\n\n${formatTable(columns, body)}`
}

/** Exact id, or the single terminal id that starts with `idOrPrefix`. */
export function resolveTerminalSessionId(db: Database, idOrPrefix: string): string {
  if (idOrPrefix.length === 0) throw new Error("Session id is required.")
  const rows = db
    .query(
      `SELECT id FROM sessions
       WHERE owner IS NULL AND (id = $id OR id LIKE $like ESCAPE '\\')
       ORDER BY updatedAt DESC, id DESC`
    )
    .all({ $id: idOrPrefix, $like: likePrefix(idOrPrefix) }) as { id: string }[]
  const exact = rows.find(row => row.id === idOrPrefix)
  if (exact) return exact.id
  const only = rows[0]
  if (rows.length === 1 && only) return only.id
  if (rows.length === 0) throw new Error(`No terminal session matches "${idOrPrefix}".`)
  throw new Error(
    `Prefix "${idOrPrefix}" matches more than one terminal session:\n${rows.map(row => row.id).join("\n")}`
  )
}

/** Markdown for one terminal session: a linked step diagram, then the transcript and every stored row. */
export function renderSessionMarkdown(db: Database, id: string, dbPath: string): string {
  const row = db.query("SELECT * FROM sessions WHERE id = $id AND owner IS NULL").get({ $id: id }) as SessionRow | null
  if (!row) throw new Error(`No terminal session matches "${id}".`)

  const messages = db
    .query("SELECT * FROM messages WHERE sessionId = $id ORDER BY seq")
    .all({ $id: id }) as MessageRow[]
  const toolCalls = db
    .query(
      `SELECT tc.* FROM tool_calls AS tc
       JOIN messages AS m ON m.id = tc.messageId
       WHERE m.sessionId = $id
       ORDER BY m.seq, tc.position`
    )
    .all({ $id: id }) as ToolCallRow[]
  const events = db
    .query("SELECT * FROM session_events WHERE sessionId = $id ORDER BY seq")
    .all({ $id: id }) as EventRow[]
  const notes = db.query("SELECT * FROM notes WHERE owner = '' ORDER BY key").all() as NoteRow[]
  const answers = db
    .query("SELECT * FROM dataset_answers WHERE owner = '' ORDER BY topic, version, field")
    .all() as AnswerRow[]
  const versions = db
    .query("SELECT * FROM dataset_versions WHERE owner = '' ORDER BY topic, version")
    .all() as VersionRow[]

  const callsByMessage = Map.groupBy(toolCalls, call => call.messageId)
  const callsByCallId = new Map(toolCalls.map(call => [call.callId, call]))
  const transcript = [
    renderSystem(row.systemPrompt),
    ...messages.map((message, index) =>
      renderMessage(index + 1, message, callsByMessage.get(message.id) ?? [], callsByCallId)
    )
  ].join("\n\n")
  const timeline =
    events.length === 0
      ? "_No timeline events stored._"
      : events.map((event, index) => renderEvent(index + 1, event)).join("\n\n")
  const memory = notes.length === 0 ? "_No memory notes for the terminal owner._" : notes.map(renderNote).join("\n\n")

  return [
    `# ${headingOf(row.title)}`,
    "",
    `\`${row.id}\``,
    "",
    renderOverview(row.systemPrompt, messages, callsByMessage, callsByCallId, events),
    "",
    metaTable([
      ["created", row.createdAt],
      ["updated", row.updatedAt],
      ["persona", row.persona],
      ["model", row.model],
      ["owner", "terminal"],
      ["pending", pendingText(row)],
      ["messages", String(messages.length)],
      ["database", dbPath]
    ]),
    "",
    "## Transcript",
    "",
    transcript,
    "",
    "## Timeline",
    "",
    timeline,
    "",
    "## Memory notes",
    "",
    "Shared by every terminal session.",
    "",
    memory,
    "",
    "## Dataset answers",
    "",
    "Shared by every terminal session.",
    "",
    renderDatasets(answers, versions)
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
}

function likePrefix(id: string): string {
  return `${id.replace(/[\\%_]/g, char => `\\${char}`)}%`
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => row[index]?.length ?? 0)))
  const line = (cells: string[]) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd()
  return [line(headers), ...rows.map(line)].join("\n")
}

function headingOf(title: string): string {
  const flat = title.replace(/\r?\n/g, " ").trim()
  return flat.length > 0 ? flat : "Session"
}

function pendingText(row: SessionRow): string {
  if (row.pendingCallId == null && row.pendingKind == null) return "none"
  return [row.pendingKind, row.pendingCallId].filter(part => part != null).join(" · ")
}

function metaTable(pairs: [string, string][]): string {
  const lines = ["| | |", "| --- | --- |"]
  for (const [key, value] of pairs) lines.push(`| ${key} | ${value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")} |`)
  return lines.join("\n")
}

function renderSystem(prompt: string | null): string {
  const heading = `${anchor("step-system")}\n\n### System`
  const body = prompt == null ? `${heading}\n\n_No system prompt stored._` : `${heading}\n\n${fence(prompt)}`
  return collapsed("System", body)
}

function renderMessage(
  index: number,
  message: MessageRow,
  calls: ToolCallRow[],
  callsByCallId: Map<string, ToolCallRow>
): string {
  const lines = [
    anchor(`step-${index}`),
    "",
    `### ${index}. ${roleLabel(message.role)}`,
    "",
    `_stored ${message.createdAt}_`
  ]
  if (message.toolCallId) {
    const call = callsByCallId.get(message.toolCallId)
    lines.push("", call ? `\`${call.name}\` · \`${message.toolCallId}\`` : `\`${message.toolCallId}\``)
  }
  if (message.reasoning != null) lines.push("", "**Reasoning**", "", fence(message.reasoning))
  if (message.content != null) lines.push("", fence(message.content))
  if (message.parts != null) {
    const pretty = prettyJson(message.parts)
    lines.push("", fence(pretty.text, pretty.lang))
  }
  for (const call of calls) {
    const pretty = prettyJson(call.arguments)
    lines.push("", `**Tool call** ${callBits(call)}`, "", fence(pretty.text, pretty.lang))
  }
  const stats = statsLine(message)
  if (stats) lines.push("", stats)
  if (
    message.reasoning == null &&
    message.content == null &&
    message.parts == null &&
    calls.length === 0 &&
    message.toolCallId == null
  )
    lines.push("", "_empty_")
  return collapsed(`${index}. ${roleLabel(message.role)}`, lines.join("\n"))
}

function collapsed(summary: string, body: string): string {
  return [`<details>`, `<summary>${summary}</summary>`, "", body, "", "</details>"].join("\n")
}

function anchor(id: string): string {
  return `<a id="${id}"></a>`
}

function renderOverview(
  systemPrompt: string | null,
  messages: MessageRow[],
  callsByMessage: Map<string, ToolCallRow[]>,
  callsByCallId: Map<string, ToolCallRow>,
  events: EventRow[]
): string {
  const lines = ["```mermaid", "sequenceDiagram", "    autonumber"]
  lines.push("    box rgba(219, 234, 254, 0.35) Front door")
  lines.push("    actor User")
  lines.push("    end")
  lines.push("    box rgba(254, 243, 199, 0.35) Agent loop")
  lines.push("    participant Agent")
  lines.push("    participant Model")
  lines.push("    end")
  lines.push("    box rgba(220, 252, 231, 0.35) Execution")
  lines.push("    participant Tools")
  lines.push("    participant Host")
  lines.push("    end")
  lines.push("    box rgba(229, 231, 235, 0.35) Persistence")
  lines.push("    participant Store")
  lines.push("    participant Timeline")
  lines.push("    end")

  if (systemPrompt != null) lines.push("    Agent->>Model: Build system prompt")
  if (events.length === 0) {
    const nodes = messages.map((message, index) => {
      const calls = callsByMessage.get(message.id) ?? []
      return `${index + 1} ${roleLabel(message.role)}: ${stepBlurb(message, calls, callsByCallId)}`
    })
    if (nodes.length === 0) lines.push("    Note over Agent,Store: No events or messages stored")
    for (const label of nodes) lines.push(`    Agent->>Model: ${diagramLabel(label)}`)
  } else {
    for (const [index, event] of events.entries()) {
      const label = `${index + 1} ${event.type}: ${eventBlurb(event)}`
      const target = eventParticipant(event)
      lines.push(`    Agent->>${target}: ${diagramLabel(label)}`)
    }
    lines.push("    Agent->>Store: Persist messages, events, and telemetry")
  }
  lines.push("    Agent->>Timeline: Open event details")
  for (const [index] of events.entries()) {
    lines.push(`    link Timeline: Event ${index + 1} @ #timeline-${index + 1}`)
  }
  lines.push("```")
  return lines.join("\n")
}

function stepBlurb(message: MessageRow, calls: ToolCallRow[], callsByCallId: Map<string, ToolCallRow>): string {
  if (message.role === "tool") {
    const call = message.toolCallId ? callsByCallId.get(message.toolCallId) : undefined
    return call?.status ? `${call.name} ${call.status}` : (call?.name ?? "result")
  }
  if (calls.length > 0) return calls.map(call => call.name).join(", ")
  if (message.content?.trim()) return message.content
  if (message.parts) return "image"
  if (message.reasoning?.trim()) return message.reasoning
  return message.role
}

function eventBlurb(event: EventRow): string {
  let payload: unknown
  try {
    payload = JSON.parse(event.payload)
  } catch {
    return event.type
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return event.type
  const data = payload as Record<string, unknown>
  if (event.type === "tool_call" || event.type === "client_tool_call") return String(data.name ?? event.type)
  if (event.type === "confirm_command" || event.type === "confirm_tool") {
    return String(data.command ?? data.name ?? event.type)
  }
  if (event.type === "error") return String(data.category ?? data.text ?? event.type)
  if (event.type === "usage") return String(data.model ?? event.type)
  if (event.type === "tool_approval") return String(data.approved ?? event.type)
  if (event.type === "ask_user") return String(data.question ?? event.type)
  if (event.type === "tool_image") return String(data.path ?? event.type)
  if (event.type === "display_image") return String(data.alt ?? event.type)
  if (typeof data.content === "string") return data.content
  if (typeof data.text === "string") return data.text
  if (typeof data.label === "string") return data.label
  return event.type
}

function eventParticipant(event: EventRow): string {
  if (event.type === "user" || event.type === "ask_user") return "User"
  if (event.type === "tool_call" || event.type === "client_tool_call" || event.type === "tool_image") return "Tools"
  if (event.type === "confirm_command" || event.type === "confirm_tool" || event.type === "tool_approval") return "Host"
  return "Model"
}

function diagramLabel(text: string): string {
  const flat = text
    .replace(/[#;"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (flat.length === 0) return "(empty)"
  return flat.length <= 48 ? flat : `${flat.slice(0, 47)}…`
}

function roleLabel(role: string): string {
  if (role === "user") return "User"
  if (role === "assistant") return "Assistant"
  if (role === "tool") return "Tool"
  if (role === "system") return "System"
  return role
}

function callBits(call: ToolCallRow): string {
  const bits = [`\`${call.name}\``, `\`${call.callId}\``]
  if (call.status) bits.push(call.status)
  if (call.durationMs != null) bits.push(`${call.durationMs} ms`)
  if (call.approval) bits.push(call.approval)
  return bits.join(" · ")
}

function statsLine(message: MessageRow): string | undefined {
  const bits: string[] = []
  if (message.persona) bits.push(message.persona)
  if (message.model) bits.push(message.model)
  if (message.promptTokens != null) bits.push(`${message.promptTokens} prompt tokens`)
  if (message.completionTokens != null) bits.push(`${message.completionTokens} completion tokens`)
  if (message.latencyMs != null) bits.push(`${message.latencyMs} ms`)
  if (message.finishReason) bits.push(message.finishReason)
  return bits.length > 0 ? bits.join(" · ") : undefined
}

function renderEvent(index: number, event: EventRow): string {
  const heading = `### ${index}. ${event.type}`
  const eventAnchor = anchor(`timeline-${index}`)
  let payload: unknown
  try {
    payload = JSON.parse(event.payload)
  } catch {
    return collapsed(`${index}. ${event.type}`, `${eventAnchor}\n\n${heading}\n\n${fence(event.payload)}`)
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return collapsed(
      `${index}. ${event.type}`,
      `${eventAnchor}\n\n${heading}\n\n${fence(JSON.stringify(payload, null, 2), "json")}`
    )
  }
  return collapsed(
    `${index}. ${event.type}`,
    `${eventAnchor}\n\n${heading}\n\n${renderPayload(event.type, payload as Record<string, unknown>)}`
  )
}

function renderPayload(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "user":
    case "reasoning":
      return textBlock(payload.text)
    case "message":
    case "final":
      return textBlock(payload.content)
    case "tool_call":
    case "client_tool_call":
      return joinBlocks([textBlock(payload.name), jsonBlock(payload.arguments)])
    case "tool_image":
      return textBlock(payload.path)
    case "display_image":
      return joinBlocks([textBlock(payload.alt), textBlock(payload.url)])
    case "ask_user":
      return joinBlocks([textBlock(payload.question), payload.note == null ? undefined : textBlock(payload.note)])
    case "confirm_command":
      return joinBlocks([textBlock(payload.command), textBlock(payload.description)])
    case "confirm_tool":
      return joinBlocks([
        textBlock(payload.summary),
        textBlock(payload.name),
        textBlock(payload.id),
        jsonBlock(payload.arguments)
      ])
    case "persona_switch":
      return joinBlocks([textBlock(payload.label), textBlock(payload.personaId)])
    case "error":
      return joinBlocks([textBlock(payload.category), textBlock(payload.text)])
    case "usage":
      return joinBlocks([textBlock(payload.model), textBlock(payload.promptTokens)])
    case "tool_approval":
      return textBlock(payload.approved)
    default:
      return fence(JSON.stringify(payload, null, 2), "json")
  }
}

function renderNote(note: NoteRow): string {
  const tags = tagList(note.tags)
  const sticky = note.sticky === 1 ? " · sticky" : ""
  return [
    `### ${note.key}`,
    "",
    `${note.importance}${sticky} · used ${note.useCount} · tags ${tags}`,
    "",
    `created ${note.createdAt} · last used ${note.lastUsedAt}`,
    "",
    fence(note.content)
  ].join("\n")
}

function tagList(stored: string): string {
  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(tag => String(tag)).join(", ")
  } catch {
    return stored
  }
  return "_none_"
}

function renderDatasets(answers: AnswerRow[], versions: VersionRow[]): string {
  if (answers.length === 0 && versions.length === 0) return "_No dataset answers for the terminal owner._"
  const groups = new Map<string, { topic: string; version: number; answers: AnswerRow[]; completedAt?: string }>()
  for (const version of versions) {
    groups.set(`${version.topic}\0${version.version}`, {
      topic: version.topic,
      version: version.version,
      answers: [],
      completedAt: version.completedAt
    })
  }
  for (const answer of answers) {
    const key = `${answer.topic}\0${answer.version}`
    const group = groups.get(key) ?? { topic: answer.topic, version: answer.version, answers: [] }
    group.answers.push(answer)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(group => {
      const completed = group.completedAt ? `completed ${group.completedAt}` : "_not marked complete_"
      const fields = group.answers.map(answer =>
        [`#### ${answer.field}`, "", `_answered ${answer.answeredAt}_`, "", fence(answer.value)].join("\n")
      )
      return [`### ${group.topic} · version ${group.version}`, "", completed, "", fields.join("\n\n")]
        .filter(Boolean)
        .join("\n")
    })
    .join("\n\n")
}

function prettyJson(stored: string): { text: string; lang: string } {
  try {
    return { text: JSON.stringify(JSON.parse(stored), null, 2), lang: "json" }
  } catch {
    return { text: stored, lang: "" }
  }
}

function textBlock(value: unknown): string {
  if (typeof value === "string") return fence(value)
  if (value == null) return "_empty_"
  return fence(JSON.stringify(value, null, 2), "json")
}

function jsonBlock(value: unknown): string {
  if (typeof value === "string") {
    const pretty = prettyJson(value)
    return fence(pretty.text, pretty.lang)
  }
  if (value == null) return "_empty_"
  return fence(JSON.stringify(value, null, 2), "json")
}

function joinBlocks(blocks: (string | undefined)[]): string {
  const present = blocks.filter((block): block is string => block !== undefined)
  return present.length > 0 ? present.join("\n\n") : "_empty_"
}

function fence(text: string, lang = ""): string {
  let ticks = "```"
  while (text.includes(ticks)) ticks += "`"
  return `${ticks}${lang}\n${text}\n${ticks}`
}

async function run(args: string[]) {
  const [command, id, extra] = args
  if (command === "list" && id === undefined) {
    const dbPath = await resolveMemoryDbPath()
    const db = openReadonly(dbPath)
    try {
      process.stdout.write(`${formatSessionList(listTerminalSessions(db), dbPath)}\n`)
    } finally {
      db.close()
    }
    return
  }
  if (command === "dump" && id !== undefined && extra === undefined) {
    const dbPath = await resolveMemoryDbPath()
    const db = openReadonly(dbPath)
    try {
      const resolved = resolveTerminalSessionId(db, id)
      process.stdout.write(`${renderSessionMarkdown(db, resolved, dbPath)}\n`)
    } finally {
      db.close()
    }
    return
  }
  console.error(USAGE)
  process.exit(1)
}

if (import.meta.main) {
  run(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
