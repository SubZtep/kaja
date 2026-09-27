import type { ApiSandboxFrame, SandboxFrame, SandboxInfo, SandboxLoad, SandboxStats } from "@kaja/schema/api"

/** Statuses a Response can't carry a body with. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])
const STATS_TIMEOUT_MS = 3000

type PendingRequest = {
  kind: "request"
  resolve: (res: Response) => void
  reject: (error: Error) => void
  /** Set once the head arrived and the Response was handed out. */
  body?: ReadableStreamDefaultController<Uint8Array>
  headed: boolean
}
type PendingStats = { kind: "stats"; resolve: (stats: SandboxStats) => void; reject: (error: Error) => void }

export class SandboxGoneError extends Error {
  constructor() {
    super("the sandbox disconnected")
    this.name = "SandboxGoneError"
  }
}

/**
 * The API's end of one connected sandbox's WebSocket: sends it MCP requests as frames and turns its answer frames back
 * into streamed Responses (so an SSE reply streams), plus its stats on request.
 */
export class SandboxTunnel {
  readonly id: string
  readonly info: SandboxInfo
  load: SandboxLoad | null = null
  /** Servers it runs, from its latest heartbeat or answer, whichever came last. */
  running: number | null = null
  readonly #send: (text: string) => void
  readonly #pending = new Map<string, PendingRequest | PendingStats>()
  #next = 0
  #closed = false

  constructor(opts: { id: string; info: SandboxInfo; send: (text: string) => void }) {
    this.id = opts.id
    this.info = opts.info
    this.#send = opts.send
  }

  get closed(): boolean {
    return this.#closed
  }

  /** Requests in flight. */
  get pending(): number {
    return this.#pending.size
  }

  /** Sends `<any origin>/mcp/<ability>` to the sandbox for the opaque `user`; its answer streams back. */
  async request(user: string, input: string | URL, init?: RequestInit): Promise<Response> {
    if (this.#closed) throw new SandboxGoneError()
    const request = new Request(input, init)
    const match = /^\/mcp\/([^/]+)$/.exec(new URL(request.url).pathname)
    if (!match) return Response.json({ error: "not found" }, { status: 404 })
    const body = request.body ? Buffer.from(await request.arrayBuffer()).toString("base64") : null
    const id = String(++this.#next)
    const signal = init?.signal ?? undefined
    return new Promise<Response>((resolve, reject) => {
      const pending: PendingRequest = { kind: "request", resolve, reject, headed: false }
      this.#pending.set(id, pending)
      signal?.addEventListener(
        "abort",
        () => {
          if (!this.#pending.has(id)) return
          this.#pending.delete(id)
          this.#frame({ t: "cancel", id })
          const reason = signal.reason instanceof Error ? signal.reason : new Error("aborted")
          if (pending.body) pending.body.error(reason)
          else reject(reason)
        },
        { once: true }
      )
      this.#frame({
        t: "request",
        id,
        user,
        ability: decodeURIComponent(match[1]!),
        method: request.method,
        headers: [...request.headers],
        body
      })
    })
  }

  /** Tells the sandbox to stop the opaque `user`'s `ability` server now (their turn on it ended). */
  release(user: string, ability: string) {
    this.#frame({ t: "release", user, ability })
  }

  /** The sandbox's live stats; rejects when it doesn't answer in time. */
  stats(timeoutMs = STATS_TIMEOUT_MS): Promise<SandboxStats> {
    if (this.#closed) return Promise.reject(new SandboxGoneError())
    const id = String(++this.#next)
    return new Promise<SandboxStats>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error("the sandbox didn't answer"))
      }, timeoutMs)
      this.#pending.set(id, {
        kind: "stats",
        resolve: stats => {
          clearTimeout(timer)
          resolve(stats)
        },
        reject: error => {
          clearTimeout(timer)
          reject(error)
        }
      })
      this.#frame({ t: "stats", id })
    })
  }

  /** Handles an answer frame from the sandbox (hello and heartbeats are the connection's). */
  receive(frame: SandboxFrame) {
    if (frame.t === "hello") return
    if (frame.t === "heartbeat") {
      this.load = frame.load
      this.running = frame.load.running
      return
    }
    if (frame.t === "head") this.running = frame.running
    const pending = this.#pending.get(frame.id)
    if (!pending) return
    if (pending.kind === "stats") {
      this.#pending.delete(frame.id)
      if (frame.t === "stats") pending.resolve(frame.stats)
      else if (frame.t === "error") pending.reject(new Error(frame.message))
      return
    }
    switch (frame.t) {
      case "head":
        this.#head(frame, pending)
        return
      case "chunk":
        pending.body?.enqueue(new Uint8Array(Buffer.from(frame.data, "base64")))
        return
      case "end":
        this.#pending.delete(frame.id)
        if (pending.body) pending.body.close()
        else if (!pending.headed) pending.reject(new Error("the sandbox sent no answer"))
        return
      case "error": {
        this.#pending.delete(frame.id)
        const error = new Error(frame.message)
        if (pending.body) pending.body.error(error)
        else pending.reject(error)
        return
      }
    }
  }

  // A request's status and headers arrived: its Response resolves now, the body streams in as chunks
  #head(frame: Extract<SandboxFrame, { t: "head" }>, pending: PendingRequest) {
    if (pending.headed) return
    pending.headed = true
    const headers = new Headers(frame.headers)
    if (NULL_BODY_STATUSES.has(frame.status)) {
      pending.resolve(new Response(null, { status: frame.status, headers }))
      return
    }
    const body = new ReadableStream<Uint8Array>({
      start: controller => {
        pending.body = controller
      },
      cancel: () => {
        if (this.#pending.delete(frame.id)) this.#frame({ t: "cancel", id: frame.id })
      }
    })
    pending.resolve(new Response(body, { status: frame.status, headers }))
  }

  /** The socket closed: everything in flight fails. */
  close() {
    this.#closed = true
    const gone = new SandboxGoneError()
    for (const pending of this.#pending.values()) {
      if (pending.kind === "request" && pending.body) pending.body.error(gone)
      else pending.reject(gone)
    }
    this.#pending.clear()
  }

  #frame(frame: ApiSandboxFrame) {
    if (!this.#closed) this.#send(JSON.stringify(frame))
  }
}
