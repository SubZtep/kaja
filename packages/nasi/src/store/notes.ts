import type { MemoryNote, MemoryStore } from "@kaja/schema/store"

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
