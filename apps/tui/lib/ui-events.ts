import { EventEmitter } from "node:events"

/** App-wide UI requests that whoever owns the state answers: `copy` asks the chat to copy its latest message (the key bar's button, without knowing the chat). */
export const uiEvents = new EventEmitter<{ copy: [] }>()
