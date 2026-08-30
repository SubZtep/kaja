import type { MemoryNote, MemoryStore } from "@kaja/schema/store"
import { getDb } from "./db"

const INSERT_NOTE_SQL = `
  INSERT INTO notes (key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount)
  VALUES ($key, $content, $importance, $tags, $sticky, $createdAt, $lastUsedAt, $useCount)
`

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

export function noteHeader(key: string, note: MemoryNote) {
  const flags = note.sticky ? `${note.importance}, sticky` : note.importance
  const tags = note.tags.length > 0 ? ` (tags: ${note.tags.join(", ")})` : ""
  return `${key} [${flags}]${tags} (used ${note.lastUsedAt.slice(0, 10)})`
}

export function forgetNotes(store: MemoryStore, selector: { key?: string; tag?: string; pattern?: string }): string[] {
  let victims: string[]
  if (selector.key !== undefined) {
    victims = selector.key in store ? [selector.key] : []
  } else if (selector.tag !== undefined) {
    victims = Object.entries(store)
      .filter(([, note]) => note.tags.includes(selector.tag!))
      .map(([key]) => key)
  } else if (selector.pattern !== undefined) {
    const glob = new Bun.Glob(selector.pattern)
    victims = Object.keys(store).filter(key => glob.match(key))
  } else {
    victims = []
  }
  for (const key of victims) delete store[key]
  return victims
}

function rowToNote(row: {
  content: string
  importance: string
  tags: string
  sticky: number
  createdAt: string
  lastUsedAt: string
  useCount: number
}): MemoryNote {
  return {
    content: row.content,
    importance: row.importance as MemoryNote["importance"],
    tags: JSON.parse(row.tags),
    sticky: row.sticky === 1,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount
  }
}

export async function loadMemory(): Promise<MemoryStore> {
  const database = getDb()
  const rows = database
    .query("SELECT key, content, importance, tags, sticky, createdAt, lastUsedAt, useCount FROM notes")
    .all() as ({ key: string } & Parameters<typeof rowToNote>[0])[]

  const store: MemoryStore = {}
  for (const row of rows) store[row.key] = rowToNote(row)
  return store
}

export async function saveMemory(store: MemoryStore) {
  const database = getDb()

  const deleteAll = database.query("DELETE FROM notes")
  const insert = database.query(INSERT_NOTE_SQL)

  database.transaction(() => {
    deleteAll.run()
    for (const [key, note] of Object.entries(store)) insert.run(noteParams(key, note))
  })()
}
