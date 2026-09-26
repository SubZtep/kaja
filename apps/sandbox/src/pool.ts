import type { SandboxServer } from "./manifests"
import { McpRelay } from "./relay"
import { reportError } from "./report"

export type PoolOptions = {
  servers: Map<string, SandboxServer>
  /** Unused this long, a server is stopped. */
  idleMs: number
  /** Most servers running at once, over all users. */
  maxProcesses: number
  /** Starts a server; tests swap it. */
  start?: (server: SandboxServer) => Promise<McpRelay>
}

type Entry = { relay: Promise<McpRelay>; lastUsed: number; timer?: ReturnType<typeof setTimeout> }

/** One warm server per (user, ability), started on first use and stopped once idle. */
export class ProcessPool {
  readonly #opts: PoolOptions
  readonly #entries = new Map<string, Entry>()

  constructor(opts: PoolOptions) {
    this.#opts = opts
  }

  get size(): number {
    return this.#entries.size
  }

  /** Serves an MCP request for `user`'s own `ability` server: 404 for an ability the sandbox doesn't run, 503 when it's full or the server won't start. */
  async handle(user: string, ability: string, request: Request): Promise<Response> {
    const server = this.#opts.servers.get(ability)
    if (!server) return Response.json({ error: "unknown ability" }, { status: 404 })
    const key = `${user}\n${ability}`
    let entry = this.#entries.get(key)
    if (!entry) {
      if (this.#entries.size >= this.#opts.maxProcesses)
        return Response.json({ error: "the sandbox is full, try again later" }, { status: 503 })
      entry = { relay: this.#start(key, server), lastUsed: Date.now() }
      this.#entries.set(key, entry)
    }
    let relay: McpRelay
    try {
      relay = await entry.relay
    } catch (error) {
      reportError("Sandbox couldn't start MCP server", error, { ability })
      return Response.json({ error: "the server didn't start" }, { status: 503 })
    }
    this.#touch(key, entry)
    return relay.handle(request)
  }

  /** Stops every server (shutdown). */
  async closeAll(): Promise<void> {
    const entries = [...this.#entries.values()]
    this.#entries.clear()
    await Promise.all(
      entries.map(async entry => {
        clearTimeout(entry.timer)
        await (await entry.relay.catch(() => undefined))?.close()
      })
    )
  }

  async #start(key: string, server: SandboxServer): Promise<McpRelay> {
    try {
      const relay = await (this.#opts.start ?? McpRelay.start)(server)
      relay.onclose = () => this.#forget(key, relay)
      return relay
    } catch (error) {
      this.#entries.delete(key)
      throw error
    }
  }

  #touch(key: string, entry: Entry) {
    entry.lastUsed = Date.now()
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => void this.#reap(key, entry), this.#opts.idleMs)
  }

  // A call still running gets one more idle window, so a server that stops answering is still stopped in the end.
  async #reap(key: string, entry: Entry) {
    if (this.#entries.get(key) !== entry) return
    const relay = await entry.relay
    const idle = Date.now() - entry.lastUsed
    if (relay.busy && idle < this.#opts.idleMs * 2) {
      entry.timer = setTimeout(() => void this.#reap(key, entry), this.#opts.idleMs)
      return
    }
    this.#entries.delete(key)
    await relay.close()
  }

  #forget(key: string, relay: McpRelay) {
    const entry = this.#entries.get(key)
    if (!entry) return
    void entry.relay.then(current => {
      if (current !== relay || this.#entries.get(key) !== entry) return
      clearTimeout(entry.timer)
      this.#entries.delete(key)
    })
  }
}
