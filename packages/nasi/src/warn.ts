export type WarnHandler = (message: string, payload?: Record<string, unknown>) => void

let handler: WarnHandler = () => {}

/** Sends nasi's warnings (skipped abilities, missing keys, MCP connect failures) to the host's log; silent until set. */
export function setWarnHandler(fn: WarnHandler) {
  handler = fn
}

/** A recoverable problem, reported to the host's log: nasi's own code and the hosts' modules call it. */
export const warn: WarnHandler = (message, payload) => handler(message, payload)
