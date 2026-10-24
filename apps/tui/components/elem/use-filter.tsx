import type { Key } from "ink"
import { Text } from "ink"
import { useState } from "react"
import { t } from "../../lib/i18n"

/** Whether a menu row matches what was typed: every word of it, anywhere, in any case. */
export function matchesFilter(label: string, query: string): boolean {
  const text = label.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every(word => text.includes(word))
}

/**
 * Type-to-filter for a menu: printable keys narrow it, Backspace widens it, and Esc clears it before it closes
 * anything. `handle` says whether it took the key, so the menu leaves that one alone.
 */
export function useFilter(enabled: boolean) {
  const [query, setQuery] = useState("")
  function handle(input: string, key: Key): boolean {
    if (!enabled) return false
    if (key.backspace || key.delete || key.escape) {
      if (!query) return false
      setQuery(key.escape ? "" : query.slice(0, -1))
      return true
    }
    // Control characters (arrows' escape sequences included) are keys, not text
    if (
      !input ||
      key.ctrl ||
      key.meta ||
      key.return ||
      key.tab ||
      Array.from({ length: input.length }, (_, at) => input.charCodeAt(at)).some(code => code < 32 || code === 127)
    )
      return false
    setQuery(query + input)
    return true
  }
  return { query, handle }
}

/** The line above a filterable menu: what's typed so far, or how to start. */
export function FilterLine({ query }: Readonly<{ query: string }>) {
  return (
    <Text>
      <Text dimColor>{t("menu.filter")} </Text>
      {query ? <Text bold>{query}</Text> : <Text dimColor>{t("menu.filterPlaceholder")}</Text>}
    </Text>
  )
}
