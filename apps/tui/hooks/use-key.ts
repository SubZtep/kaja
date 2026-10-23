import { type Key, useInput } from "ink"

/**
 * Ink's `useInput` without key releases: the kitty protocol flags the chat asks for report every key's release too,
 * and a handler would otherwise act twice.
 */
export function useKey(handler: (input: string, key: Key) => void, options?: Parameters<typeof useInput>[1]) {
  useInput((input, key) => {
    if (key.eventType !== "release") handler(input, key)
  }, options)
}
