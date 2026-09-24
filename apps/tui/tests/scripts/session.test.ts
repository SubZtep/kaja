import { Database } from "bun:sqlite"
import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSqliteStore } from "../../lib/store/sqlite"
import {
  formatSessionList,
  listTerminalSessions,
  openReadonly,
  renderSessionMarkdown,
  resolveTerminalSessionId
} from "../../scripts/session"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "kaja-session-debug-"))
  dirs.push(dir)
  return dir
}

function insertSession(dbPath: string, id: string, owner: string | null, title: string, updatedAt: string) {
  const db = new Database(dbPath)
  db.query(
    `INSERT INTO sessions (id, createdAt, updatedAt, persona, model, title, owner)
     VALUES ($id, $createdAt, $updatedAt, 'kaja', 'stub-model', $title, $owner)`
  ).run({ $id: id, $createdAt: updatedAt, $updatedAt: updatedAt, $title: title, $owner: owner })
  db.close()
}

test("openReadonly leaves a missing file missing and rejects writes", () => {
  const dir = tempDir()
  const missing = join(dir, "missing.sqlite")
  expect(() => openReadonly(missing)).toThrow(`No database at ${missing}.`)
  expect(existsSync(missing)).toBe(false)

  const dbPath = join(dir, "memory.sqlite")
  createSqliteStore(dbPath)
  const db = openReadonly(dbPath)
  expect(() =>
    db.run(
      "INSERT INTO notes (owner, key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount) VALUES ('', 'k', 'c', 'low', '[]', 0, '', '', 0)"
    )
  ).toThrow()
  db.close()
})

test("list, prefix match, and dump cover the terminal session and leave secrets out", async () => {
  const dir = tempDir()
  const dbPath = join(dir, "memory.sqlite")
  const store = createSqliteStore(dbPath)
  const id = await store.createSession({
    persona: "kaja",
    model: "test-model",
    owner: null,
    title: "debug-title",
    session: {
      messages: [
        { role: "system", content: "be helpful" },
        { role: "user", content: "hi" },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }]
        },
        {
          role: "assistant",
          content: "done ``` really",
          reasoning_content: "hmm",
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "read_thing", arguments: '{"path":"notes.txt"}' } }
          ]
        },
        { role: "tool", tool_call_id: "call_1", content: "file body" }
      ],
      pendingAskUserId: "call_9",
      telemetry: {
        steps: [
          {
            at: 2,
            model: "served-model",
            persona: "kaja",
            promptTokens: 10,
            completionTokens: 4,
            latencyMs: 120,
            finishReason: "tool_calls"
          }
        ],
        calls: { call_1: { status: "ok", durationMs: 7, approval: "approved" } }
      }
    },
    events: [
      { type: "user", text: "hi" },
      { type: "reasoning", text: "hmm" },
      { type: "tool_call", name: "read_thing", arguments: '{"path":"notes.txt"}' },
      { type: "final", content: "done ``` really" },
      { type: "persona_switch", personaId: "care", label: "Care" },
      { type: "error", text: "boom", category: "network" }
    ]
  })
  await store.saveMemory(null, {
    "user:name": {
      content: "terminal-note-body",
      importance: "high",
      tags: ["debug"],
      sticky: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: "2026-01-02T00:00:00.000Z",
      useCount: 3
    }
  })
  await store.saveMemory("telegram:1", {
    "tg:only": {
      content: "telegram-note-body",
      importance: "low",
      tags: [],
      sticky: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      useCount: 0
    }
  })
  await store.saveDatasetAnswer("onboarding", null, 1, "city", "Budapest")
  await store.markDatasetVersionComplete("onboarding", null, 1)

  insertSession(dbPath, "stub-aaa", null, "alpha-title", "2020-01-01T00:00:00.000Z")
  insertSession(dbPath, "stub-bbb", null, "beta-title", "2020-01-02T00:00:00.000Z")
  insertSession(dbPath, "a_b-1", null, "underscore-title", "2020-01-03T00:00:00.000Z")
  insertSession(dbPath, "aXb-1", null, "wildcard-title", "2020-01-04T00:00:00.000Z")
  insertSession(dbPath, "telegram-session", "telegram:9", "telegram-only-title", "2026-09-23T00:00:00.000Z")

  const db = openReadonly(dbPath)
  const listed = formatSessionList(listTerminalSessions(db), dbPath)
  expect(listed).toContain(dbPath)
  expect(listed).toContain(id)
  expect(listed).toContain("debug-title")
  expect(listed.indexOf(id)).toBeLessThan(listed.indexOf("stub-aaa"))
  expect(listed).not.toContain("telegram-session")
  expect(listed).not.toContain("telegram-only-title")

  expect(resolveTerminalSessionId(db, id.slice(0, 8))).toBe(id)
  expect(resolveTerminalSessionId(db, "stub-aaa")).toBe("stub-aaa")
  expect(resolveTerminalSessionId(db, "a_b")).toBe("a_b-1")
  expect(() => resolveTerminalSessionId(db, "stub")).toThrow(/more than one/)
  expect(() => resolveTerminalSessionId(db, "telegram-session")).toThrow(/No terminal session matches/)
  expect(() => resolveTerminalSessionId(db, "")).toThrow("Session id is required.")

  const markdown = renderSessionMarkdown(db, id, dbPath)
  db.close()

  expect(markdown).toContain("```mermaid")
  expect(markdown).toContain("sequenceDiagram")
  expect(markdown).toContain("box rgba(254, 243, 199, 0.35) Agent loop")
  expect(markdown).toContain("participant Timeline")
  expect(markdown).toContain("Agent->>Tools: 3 tool_call: read_thing")
  expect(markdown).toContain("link Timeline: Event 1 @ #timeline-1")
  expect(markdown).toContain("link Timeline: Event 6 @ #timeline-6")
  expect(markdown).toContain('<a id="step-system"></a>')
  expect(markdown).toContain('<a id="step-1"></a>')
  expect(markdown).toContain('<a id="timeline-1"></a>')
  expect(markdown).toContain("<summary>System</summary>")
  expect(markdown).toContain("<summary>1. User</summary>")
  expect(markdown).toContain("<summary>1. user</summary>")
  expect(markdown).toContain("<summary>6. error</summary>")
  expect(markdown.match(/<details>/g)?.length).toBe(11)
  expect(markdown.match(/<\/details>/g)?.length).toBe(11)
  expect(markdown).toContain("1 user: hi")
  expect(markdown.indexOf("```mermaid")).toBeLessThan(markdown.indexOf("## Transcript"))
  expect(markdown).toContain("be helpful")
  expect(markdown).toContain("hi")
  expect(markdown).toContain("hmm")
  expect(markdown).toContain("read_thing")
  expect(markdown).toContain("notes.txt")
  expect(markdown).toContain("file body")
  expect(markdown).toContain("done ``` really")
  expect(markdown).toContain("````")
  // Images are stored apart; the dump shows the reference, not the bytes.
  expect(markdown).toContain("kaja-image:")
  expect(markdown).toContain("10 prompt tokens")
  expect(markdown).toContain("4 completion tokens")
  expect(markdown).toContain("120 ms")
  expect(markdown).toContain("served-model")
  expect(markdown).toContain("ask_user · call_9")
  expect(markdown).toContain("7 ms")
  expect(markdown).toContain("approved")
  expect(markdown).toContain("Care")
  expect(markdown).toContain("boom")
  expect(markdown).toContain("network")
  expect(markdown).toContain("terminal-note-body")
  expect(markdown).toContain("Budapest")
  expect(markdown).not.toContain("## Config")
  expect(markdown).not.toContain("## Raw")
  expect(markdown).not.toContain("debug-settings-marker")
  expect(markdown).not.toContain("sk-live-secret-value")
  expect(markdown).not.toContain("sk-live-secret-value")
  expect(markdown).not.toContain("telegram-note-body")
  expect(markdown).not.toContain("beta-title")
  expect(markdown).not.toContain("telegram-only-title")

  const stubDb = openReadonly(dbPath)
  const stub = renderSessionMarkdown(stubDb, "stub-aaa", dbPath)
  stubDb.close()
  expect(stub).toContain("alpha-title")
  expect(stub).toContain("terminal-note-body")
  expect(stub).not.toContain("be helpful")
  expect(stub).not.toContain("beta-title")
})

test("the meta table escapes backslashes and pipes, so a value can't break out of its cell", async () => {
  const dbPath = join(tempDir(), "memory.sqlite")
  const store = createSqliteStore(dbPath)
  const id = await store.createSession({
    persona: "kaja",
    model: "a|b\\",
    owner: null,
    title: "escape-title",
    session: { messages: [{ role: "user", content: "hi" }] },
    events: []
  })

  const db = openReadonly(dbPath)
  const markdown = renderSessionMarkdown(db, id, "C:\\kaja\\|memory.sqlite")
  db.close()
  expect(markdown).toContain("| model | a\\|b\\\\ |")
  expect(markdown).toContain("| database | C:\\\\kaja\\\\\\|memory.sqlite |")
})
