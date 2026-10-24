import type { Key } from "ink"
import { Box, Text } from "ink"
import { useState } from "react"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { textWidth } from "./rail"

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

/**
 * The line above a filterable menu: "›", what's typed so far with the cursor (or how to start), and `count` at the
 * right.
 */
export function FilterLine({ query, count }: Readonly<{ query: string; count?: string }>) {
  const { accent } = useKajaTheme()
  return (
    <Box width={textWidth()} justifyContent="space-between">
      <Text>
        <Text {...accent()}>›</Text>{" "}
        {query ? (
          <Text>
            {query}
            <Text inverse> </Text>
          </Text>
        ) : (
          <Text dimColor>{t("menu.filterPlaceholder")}</Text>
        )}
      </Text>
      {count ? <Text dimColor>{count}</Text> : null}
    </Box>
  )
}

/** `text` with every word of `query` underlined where it occurs, so a match shows without colour. */
export function Matched({ text, query, bold }: Readonly<{ text: string; query: string; bold?: boolean }>) {
  // A focused row's name, which turns inverse where there's no colour for its band
  const { focusText } = useKajaTheme()
  const style = bold ? focusText() : {}
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return <Text {...style}>{text}</Text>
  const lower = text.toLowerCase()
  const marked = new Array<boolean>(text.length).fill(false)
  for (const word of words) {
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length))
      marked.fill(true, at, at + word.length)
  }
  // Runs of marked and unmarked characters
  const runs: { text: string; marked: boolean }[] = []
  for (let at = 0; at < text.length; at++) {
    const last = runs.at(-1)
    if (last && last.marked === marked[at]) last.text += text[at]
    else runs.push({ text: text[at]!, marked: marked[at]! })
  }
  return (
    <Text {...style}>
      {runs.map((run, index) => (
        <Text key={index} underline={run.marked}>
          {run.text}
        </Text>
      ))}
    </Text>
  )
}
