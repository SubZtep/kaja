import { EventEmitter } from "node:events"

/**
 * App-wide UI requests that whoever owns the state answers: `copy` asks the chat to copy its latest message, `pageUp`
 * and `pageDown` to scroll it a page (the key bar's buttons, without knowing the chat), `follow` to jump back to the
 * latest message (the input, once the user types). `failure` is an error nothing else caught (cli.ts's
 * unhandledRejection), for the chat to show.
 */
export const uiEvents = new EventEmitter<{
  copy: []
  pageUp: []
  pageDown: []
  follow: []
  failure: [message: string]
}>()
