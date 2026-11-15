import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  deleteNotes,
  getDefaultMemoryDbPath,
  latestDatasetVersion,
  loadDatasetAnswers,
  loadDatasetVersionCompletedAt,
  loadMemory,
  markDatasetVersionComplete,
  saveDatasetAnswer,
  saveNote
} from "../../../src/lib/memory/store"

// XDG_DATA_HOME/XDG_CONFIG_HOME are read fresh on every call (see getConfigPath/getDefaultMemoryDbPath) rather than cached at module load, so setting them per-test — even though this module was likely already imported by another test file earlier in the same `bun test` process — still isolates each test from the real ~/.local/share/kaja and ~/.config/kaja.
const dataDir = `${tmpdir()}/kaja-test-xdg-data`
const configDir = `${tmpdir()}/kaja-test-xdg-config`

afterEach(async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  await deleteNotes(null, Object.keys(await loadMemory(null)))
})

test("loadMemory returns {} for a freshly created store", async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  expect(await loadMemory(null)).toEqual({})
})

test("saveNote then loadMemory round-trips", async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  const note = {
    content: "test fact",
    importance: "high" as const,
    tags: ["a", "b"],
    sticky: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    useCount: 0
  }
  await saveNote(null, "test:key", note)
  expect(await loadMemory(null)).toEqual({ "test:key": note })
})

test("saveNote replaces only its own key, and deleteNotes removes only the keys named", async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  const note = {
    content: "a",
    importance: "low" as const,
    tags: [],
    sticky: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    useCount: 0
  }
  await saveNote(null, "test:a", note)
  await saveNote(null, "test:b", { ...note, content: "b" })
  await saveNote(null, "test:a", { ...note, content: "a again" })
  expect(await loadMemory(null)).toEqual({
    "test:a": { ...note, content: "a again" },
    "test:b": { ...note, content: "b" }
  })

  await deleteNotes(null, ["test:a", "test:missing"])
  expect(Object.keys(await loadMemory(null))).toEqual(["test:b"])
})

test("saveNote scopes notes by owner (terminal vs a Telegram user)", async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  const note = {
    content: "local fact",
    importance: "low" as const,
    tags: [],
    sticky: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    useCount: 0
  }
  await saveNote(null, "test:local", note)
  await saveNote("telegram:1", "test:telegram", { ...note, content: "telegram fact" })
  expect(await loadMemory(null)).toEqual({ "test:local": note })
  expect(await loadMemory("telegram:1")).toEqual({ "test:telegram": { ...note, content: "telegram fact" } })
})

test("data persists across a fresh process (module re-import)", async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  const note = {
    content: "persisted fact",
    importance: "medium" as const,
    tags: [],
    sticky: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
    useCount: 0
  }
  await saveNote(null, "test:persist", note)
  expect(existsSync(getDefaultMemoryDbPath())).toBe(true)

  // Simulate a process restart by running a fresh `bun` invocation against the same on-disk database, instead of re-importing within this process (module-level singletons like the cached Database connection would survive a same-process re-import and wouldn't prove real persistence).
  const result = await Bun.$`XDG_DATA_HOME=${dataDir} XDG_CONFIG_HOME=${configDir} bun -e ${`
      import { loadMemory } from "${join(import.meta.dir, "../../../src/lib/memory/store.ts")}"
      console.log(JSON.stringify(await loadMemory(null)))
    `}`.text()
  expect(JSON.parse(result.trim())).toEqual({ "test:persist": note })
})

// A fresh directory (not a fixed name) so re-running the suite never accumulates rows from a previous run's on-disk sqlite file.
const datasetDataDir = mkdtempSync(join(tmpdir(), "kaja-test-xdg-data-datasets-"))

beforeEach(() => {
  process.env.XDG_DATA_HOME = datasetDataDir
  process.env.XDG_CONFIG_HOME = configDir
})

test("latestDatasetVersion is 0 when no version has ever been started", async () => {
  expect(await latestDatasetVersion("topic-fresh", null)).toBe(0)
})

test("saveDatasetAnswer upserts by (topic, owner, version, field)", async () => {
  await saveDatasetAnswer("topic-upsert", null, 1, "favorite_color", "blue")
  await saveDatasetAnswer("topic-upsert", null, 1, "favorite_color", "red")
  const answers = await loadDatasetAnswers("topic-upsert", null, 1)
  expect(answers).toHaveLength(1)
  expect(answers[0]!.value).toBe("red")
})

test("markDatasetVersionComplete records completedAt, and marking again moves it", async () => {
  await saveDatasetAnswer("topic-complete", null, 1, "favorite_color", "blue")
  await markDatasetVersionComplete("topic-complete", null, 1)
  const first = await loadDatasetVersionCompletedAt("topic-complete", null, 1)
  expect(first).toBeDefined()
  await Bun.sleep(5)
  await markDatasetVersionComplete("topic-complete", null, 1)
  const second = await loadDatasetVersionCompletedAt("topic-complete", null, 1)
  expect(second! > first!).toBe(true)
})

test("owner scoping isolates answers between terminal (null) and a Telegram user", async () => {
  await saveDatasetAnswer("topic-owner-scope", null, 1, "favorite_color", "blue")
  await saveDatasetAnswer("topic-owner-scope", "telegram:1", 1, "favorite_color", "green")
  const localAnswers = await loadDatasetAnswers("topic-owner-scope", null, 1)
  const telegramAnswers = await loadDatasetAnswers("topic-owner-scope", "telegram:1", 1)
  expect(localAnswers.map(a => a.value)).toEqual(["blue"])
  expect(telegramAnswers.map(a => a.value)).toEqual(["green"])
})
