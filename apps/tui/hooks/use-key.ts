import { type Key, useInput } from "ink"
import { useInputBlocked } from "./use-input-blocked"

/**
 * Ink's `useInput` without key releases: the kitty protocol flags the chat asks for report every key's release too,
 * and a handler would otherwise act twice. Silent while a modal is open, unless called from inside it.
 */
export function useKey(handler: (input: string, key: Key) => void, options?: Parameters<typeof useInput>[1]) {
  const blocked = useInputBlocked()
  useInput(
    (input, key) => {
      if (key.eventType !== "release") handler(input, key)
    },
    { ...options, isActive: !blocked && (options?.isActive ?? true) }
  )
}
