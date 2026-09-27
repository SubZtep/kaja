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

/** What the tunnel serves: an MCP request for a (pseudonymous) user's ability, a release of one, and the stats. */
export type SandboxHandler = {
  mcp: (user: string, ability: string, request: Request) => Promise<Response>
  release: (user: string, ability: string) => Promise<void>
  stats: () => Promise<SandboxStats>
  /** Servers running or starting now, sent with every answer. */
  running: () => number
}

// Bun's WebSocket takes headers; the DOM typings the root tsconfig brings in only know protocols.
const BunWebSocket = WebSocket as unknown as new (url: string, options: Bun.WebSocketOptions) => WebSocket

const HEARTBEAT_MS = 60_000
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
        void this.#request(frame)
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

  async #request(frame: Extract<ApiSandboxFrame, { t: "request" }>) {
    const controller = new AbortController()
    this.#inflight.set(frame.id, controller)
    const { signal } = controller
    try {
      const request = new Request(`http://sandbox.local/mcp/${encodeURIComponent(frame.ability)}`, {
        method: frame.method,
        headers: frame.headers,
        body: frame.body === null ? undefined : Buffer.from(frame.body, "base64"),
        signal
      })
      const response = await this.#handler.mcp(frame.user, frame.ability, request)
      if (signal.aborted) {
        await response.body?.cancel()
        return
      }
      this.#send({
        t: "head",
        id: frame.id,
        status: response.status,
        headers: [...response.headers],
        running: this.#handler.running()
      })
      if (response.body) {
        const reader = response.body.getReader()
        signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), { once: true })
        for (let read = await reader.read(); !read.done; read = await reader.read()) {
          if (signal.aborted) return
          this.#send({ t: "chunk", id: frame.id, data: Buffer.from(read.value).toString("base64") })
        }
      }
      if (!signal.aborted) this.#send({ t: "end", id: frame.id })
    } catch (error) {
      if (!signal.aborted) this.#send({ t: "error", id: frame.id, message: messageOf(error).slice(0, 500) })
    } finally {
      this.#inflight.delete(frame.id)
    }
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
  } catch {}
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
        clearInterval(heartbeat)
        heartbeat = setInterval(() => {
          opts.load().then(
            load => send({ t: "heartbeat", load }),
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
      if (stopped) return
      console.warn(`Sandbox lost the API (${event.code}${event.reason ? `: ${event.reason}` : ""}); retrying`, {
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
