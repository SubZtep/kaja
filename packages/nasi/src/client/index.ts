import {
  type NasiTurnRequest,
  NasiTurnRequestSchema,
  type NasiTurnResponse,
  type NasiTurnStatus
} from "@kaja/schema/nasi"

export type NasiClientOptions = {
  baseUrl: string
  getToken: () => Promise<string | undefined>
}

/**
 * One live event from `POST /nasi/turn/stream`, matching the server's SSE
 * event names. `delta` carries streaming tokens; the rest mirror the shapes
 * in `NasiStep` plus `usage`. Terminal events (`done`, `error`) are not
 * included here — `turn_stream`'s async generator return value / thrown
 * error carries those instead, so a `for await` consumer never has to
 * special-case them mid-stream.
 */
export type NasiStreamEvent =
  | { type: "delta"; channel: "reasoning" | "content"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "message"; content: string }
  | { type: "tool_call"; name: string; arguments: string }
  | { type: "ask_user"; question: string; note?: string }
  | { type: "persona_switch"; personaId: string; label: string }
  | { type: "usage"; promptTokens?: number; model?: string }
  | { type: "final"; content: string | null }

export class NasiStreamError extends Error {}

function parseSseBlock(block: string): { event: string; data: string } | undefined {
  let event: string | undefined
  const dataLines: string[] = []
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
  }
  if (!event) return undefined
  return { event, data: dataLines.join("\n") }
}

/**
 * Parses a `text/event-stream` body into `{ event, data }` pairs, one per
 * `\n\n`-delimited block. Buffers partial blocks split across chunk
 * boundaries — SSE framing has no length prefix, so a chunk can end
 * mid-block.
 */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split("\n\n")
      buffer = blocks.pop() ?? ""
      for (const block of blocks) {
        const parsed = parseSseBlock(block)
        if (parsed) yield parsed
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * HTTP client for hosted Nasi (`POST /nasi/turn`, `/nasi/turn/stream`). Used
 * by the lite CLI. This module must not import sqlite or the agent loop.
 */
export function createNasiClient(opts: NasiClientOptions) {
  async function headers(): Promise<HeadersInit> {
    const token = await opts.getToken()
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  }

  return {
    async turn(body: NasiTurnRequest): Promise<NasiTurnResponse> {
      const parsed = NasiTurnRequestSchema.parse(body)
      const res = await fetch(new URL("/nasi/turn", opts.baseUrl), {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(parsed)
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Nasi turn failed: ${res.status} ${text}`)
      }
      return res.json()
    },

    /**
     * Streams one turn. Yields {@link NasiStreamEvent}s as they arrive and
     * returns `{ session, status }` once the server sends its closing `done`
     * event. Throws {@link NasiStreamError} if the server sends an `error`
     * event instead, or if the connection drops before either arrives.
     */
    async *turn_stream(
      body: NasiTurnRequest
    ): AsyncGenerator<NasiStreamEvent, { session: string; status: NasiTurnStatus }, void> {
      const parsed = NasiTurnRequestSchema.parse(body)
      const res = await fetch(new URL("/nasi/turn/stream", opts.baseUrl), {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(parsed)
      })
      if (!res.ok) {
        const text = await res.text()
        throw new NasiStreamError(`Nasi turn stream failed: ${res.status} ${text}`)
      }
      if (!res.body) throw new NasiStreamError("Nasi turn stream returned no body")

      for await (const { event, data } of parseSseStream(res.body)) {
        if (event === "heartbeat") continue
        if (event === "error") {
          const parsedError = JSON.parse(data) as { error: string }
          throw new NasiStreamError(parsedError.error)
        }
        if (event === "done") {
          return JSON.parse(data) as { session: string; status: NasiTurnStatus }
        }
        yield JSON.parse(data) as NasiStreamEvent
      }
      throw new NasiStreamError("Nasi turn stream ended without a done event")
    }
  }
}
