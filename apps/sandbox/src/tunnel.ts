import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  type ApiSandboxFrame,
  apiSandboxFrameSchema,
  SANDBOX_INSTANCE_HEADER,
  SANDBOX_KEY_HEADER,
  type SandboxFrame,
  type SandboxInfo,
  type SandboxLoad,
  type SandboxStats
} from "@kaja/schema/api"
import { reportError } from "./report"

/** What the tunnel serves: an MCP request for a (pseudonymous) user's ability, a tool's outgoing request, a release of one, and the stats. */
export type SandboxHandler = {
  /** `key`: a keyed server's key, which it starts with. */
  mcp: (user: string, ability: string, request: Request, key?: string) => Promise<Response>
  /** Sends a tool's request (`fetch_url`, an HTTP tool, a remote MCP server) out through the egress proxy. */
  fetch: (user: string, request: Request) => Promise<Response>
  release: (user: string, ability: string) => Promise<void>
  stats: () => Promise<SandboxStats>
  /** Servers running or starting now, sent with every answer. */
  running: () => number
}

// Bun's WebSocket takes headers; the DOM typings the root tsconfig brings in only know protocols.
const BunWebSocket = WebSocket as unknown as new (url: string, options: Bun.WebSocketOptions) => WebSocket

const HEARTBEAT_MS = 60_000
/** A head frame carries at most this many headers (the API's schema refuses more). */
const MAX_HEADERS = 100
const MIN_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 60_000

/** The sandbox's end of the socket: runs each request frame through the handler and streams the answer back as frames. */
export class TunnelServer {
  readonly #handler: SandboxHandler
  readonly #send: (frame: SandboxFrame) => void
  readonly #inflight = new Map<string, AbortController>()

  constructor(handler: SandboxHandler, send: (frame: SandboxFrame) => void) {
    this.#handler = handler
    this.#send = send
  }

  receive(frame: ApiSandboxFrame) {
    switch (frame.t) {
      case "request":
        void this.#answer(frame.id, signal =>
          this.#handler.mcp(
            frame.user,
            frame.ability,
            new Request(`http://sandbox.local/mcp/${encodeURIComponent(frame.ability)}`, requestInit(frame, signal)),
            frame.key
          )
        )
        return
      case "fetch":
        void this.#answer(frame.id, signal =>
          this.#handler.fetch(frame.user, new Request(frame.url, requestInit(frame, signal)))
        )
        return
      case "cancel":
        this.#inflight.get(frame.id)?.abort()
        this.#inflight.delete(frame.id)
        return
      case "stats":
        this.#handler.stats().then(
          stats => this.#send({ t: "stats", id: frame.id, stats }),
          error => this.#send({ t: "error", id: frame.id, message: messageOf(error) })
        )
        return
      case "release":
        this.#handler
          .release(frame.user, frame.ability)
          .catch(error => reportError("Sandbox couldn't release MCP server", error, { ability: frame.ability }))
        return
      case "welcome":
        return
    }
  }

  /** The socket is gone: every request in flight stops. */
  abortAll() {
    for (const controller of this.#inflight.values()) controller.abort()
    this.#inflight.clear()
  }

  // Runs one request frame and streams its answer back as head, chunks and end (or error); a cancel frame aborts it.
  async #answer(id: string, run: (signal: AbortSignal) => Promise<Response>) {
    const controller = new AbortController()
    this.#inflight.set(id, controller)
    const { signal } = controller
    try {
      const response = await run(signal)
      if (signal.aborted) {
        await response.body?.cancel()
        return
      }
      this.#send({
        t: "head",
        id,
        status: response.status,
        headers: [...response.headers].slice(0, MAX_HEADERS),
        running: this.#handler.running()
      })
      if (response.body) {
        const reader = response.body.getReader()
        signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), { once: true })
        for (let read = await reader.read(); !read.done; read = await reader.read()) {
          if (signal.aborted) return
          this.#send({ t: "chunk", id, data: Buffer.from(read.value).toString("base64") })
        }
      }
      if (!signal.aborted) this.#send({ t: "end", id })
    } catch (error) {
      if (!signal.aborted) this.#send({ t: "error", id, message: messageOf(error).slice(0, 500) })
    } finally {
      this.#inflight.delete(id)
    }
  }
}

function requestInit(frame: { method: string; headers: [string, string][]; body: string | null }, signal: AbortSignal) {
  return {
    method: frame.method,
    headers: frame.headers,
    body: frame.body === null ? undefined : Buffer.from(frame.body, "base64"),
    signal
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type Instance = { api: string; id: string; secret: string }

async function readInstance(stateDir: string, api: string): Promise<Instance | undefined> {
  try {
    const saved = JSON.parse(await readFile(join(stateDir, "instance.json"), "utf8")) as Partial<Instance>
    if (saved.api === api && typeof saved.id === "string" && typeof saved.secret === "string") return saved as Instance
  } catch {
    // missing or corrupt state file: register as a new instance
  }
  return undefined
}

async function saveInstance(stateDir: string, instance: Instance) {
  try {
    await mkdir(stateDir, { recursive: true })
    await writeFile(join(stateDir, "instance.json"), JSON.stringify(instance), { mode: 0o600 })
  } catch (error) {
    console.warn("Sandbox couldn't save its registration; a restart registers it anew", { error: messageOf(error) })
  }
}

/** The API's WebSocket URL for sandboxes. */
export function connectUrl(apiUrl: string): string {
  const url = new URL("/sandbox/connect", apiUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}

/**
 * Keeps the sandbox connected to the API: says hello with `info`, keeps the id it's welcomed with in `stateDir`, sends
 * the load every minute, serves the API's requests, and reconnects (backing off up to a minute) whenever the socket drops.
 */
export function connectTunnel(opts: {
  apiUrl: string
  key?: string
  stateDir: string
  info: () => Promise<SandboxInfo>
  load: () => Promise<SandboxLoad>
  handler: SandboxHandler
  /** Told when it's welcomed (with its id), after every heartbeat, and when the socket drops. */
  onStatus?: (status: { connected: true; id: string } | { connected: false }) => void
}): { close: () => void } {
  let stopped = false
  let backoff = MIN_BACKOFF_MS
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined

  async function open() {
    const instance = await readInstance(opts.stateDir, opts.apiUrl)
    const headers: Record<string, string> = {}
    if (opts.key) headers[SANDBOX_KEY_HEADER] = opts.key
    if (instance) headers[SANDBOX_INSTANCE_HEADER] = `${instance.id}.${instance.secret}`
    const ws = new BunWebSocket(connectUrl(opts.apiUrl), { headers })
    socket = ws
    const send = (frame: SandboxFrame) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
    }
    const server = new TunnelServer(opts.handler, send)
    let heartbeat: ReturnType<typeof setInterval> | undefined

    ws.onopen = async () => send({ t: "hello", info: await opts.info() })
    ws.onmessage = event => {
      let frame: ApiSandboxFrame
      try {
        frame = apiSandboxFrameSchema.parse(JSON.parse(String(event.data)))
      } catch {
        return
      }
      if (frame.t === "welcome") {
        backoff = MIN_BACKOFF_MS
        if (frame.secret) void saveInstance(opts.stateDir, { api: opts.apiUrl, id: frame.id, secret: frame.secret })
        console.log(`Sandbox connected to ${opts.apiUrl} as ${frame.id}${opts.key ? "" : " (anonymous)"}`)
        const id = frame.id
        opts.onStatus?.({ connected: true, id })
        clearInterval(heartbeat)
        heartbeat = setInterval(() => {
          opts.load().then(
            load => {
              send({ t: "heartbeat", load })
              opts.onStatus?.({ connected: true, id })
            },
            error => reportError("Sandbox couldn't read its load", error)
          )
        }, HEARTBEAT_MS)
        return
      }
      server.receive(frame)
    }
    ws.onclose = event => {
      clearInterval(heartbeat)
      server.abortAll()
      opts.onStatus?.({ connected: false })
      if (stopped) return
      const why = event.reason ? `${event.code}: ${event.reason}` : String(event.code)
      console.warn(`Sandbox lost the API (${why}); retrying`, {
        inMs: backoff
      })
      retry = setTimeout(() => void open(), backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    }
  }

  void open()
  return {
    close: () => {
      stopped = true
      clearTimeout(retry)
      socket?.close(1000, "sandbox stopping")
    }
  }
}
