import type { SandboxServerStats, SandboxStats } from "@kaja/schema/api"
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

type Entry = {
  relay: Promise<McpRelay>
  /** The relay once it's started, for choosing a server to stop without waiting. */
  started?: McpRelay
  startedAt: number
  lastUsed: number
  timer?: ReturnType<typeof setTimeout>
}

/** One warm server per (user, ability), started on first use and stopped once idle, or sooner when another user needs the room. */
export class ProcessPool {
  readonly #opts: PoolOptions
  readonly #entries = new Map<string, Entry>()
  readonly #counts: SandboxStats["pool"] = {
    started: 0,
    failedToStart: 0,
    stoppedIdle: 0,
    madeRoom: 0,
    crashed: 0,
    refusedFull: 0
  }

  constructor(opts: PoolOptions) {
    this.#opts = opts
  }

  get size(): number {
    return this.#entries.size
  }

  /** The abilities it can run. */
  get abilities(): string[] {
    return [...this.#opts.servers.keys()]
  }

  get limits(): SandboxStats["limits"] {
    return { maxProcesses: this.#opts.maxProcesses, idleMs: this.#opts.idleMs }
  }

  /** How many servers started, stopped and were turned away since the sandbox started. */
  get counts(): SandboxStats["pool"] {
    return { ...this.#counts }
  }

  /** The servers running or starting now, without their memory (the caller reads that from their pids). */
  servers(): Omit<SandboxServerStats, "rss">[] {
    return [...this.#entries].map(([key, entry]) => ({
      user: key.slice(0, key.indexOf("\n")),
      ability: abilityOf(key),
      state: entry.started ? "running" : "starting",
      pid: entry.started?.pid ?? null,
      pending: entry.started?.pending ?? 0,
      sessions: entry.started?.sessions ?? 0,
      startedAt: new Date(entry.startedAt),
      lastUsed: new Date(entry.lastUsed)
    }))
  }

  /** Serves an MCP request for `user`'s own `ability` server: 404 for an ability the sandbox doesn't run, 503 when every server is mid-call or it won't start. */
  async handle(user: string, ability: string, request: Request): Promise<Response> {
    const server = this.#opts.servers.get(ability)
    if (!server) return Response.json({ error: "unknown ability" }, { status: 404 })
    const key = `${user}\n${ability}`
    let entry = this.#entries.get(key)
    if (!entry) {
      if (this.#entries.size >= this.#opts.maxProcesses && !this.#evictIdlest()) {
        this.#counts.refusedFull++
        console.warn("Sandbox is full", { ability, processes: this.#entries.size })
        return Response.json({ error: "the sandbox is full, try again later" }, { status: 503 })
      }
      entry = { relay: this.#start(key, server), startedAt: Date.now(), lastUsed: Date.now() }
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
      const entry = this.#entries.get(key)
      if (entry) entry.started = relay
      this.#counts.started++
      console.log("Sandbox started MCP server", { ability: server.name, processes: this.#entries.size })
      return relay
    } catch (error) {
      this.#entries.delete(key)
      this.#counts.failedToStart++
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
    this.#counts.stoppedIdle++
    console.log("Sandbox stopped idle MCP server", { ability: abilityOf(key), processes: this.#entries.size })
    await relay.close()
  }

  // Stops the least recently used server that isn't mid-call, making room for a new one; false when there's none.
  #evictIdlest(): boolean {
    let idlest: [string, Entry] | undefined
    for (const item of this.#entries) {
      const relay = item[1].started
      if (!relay || relay.busy) continue
      if (!idlest || item[1].lastUsed < idlest[1].lastUsed) idlest = item
    }
    if (!idlest) return false
    const [key, entry] = idlest
    clearTimeout(entry.timer)
    this.#entries.delete(key)
    this.#counts.madeRoom++
    console.log("Sandbox stopped MCP server to make room", { ability: abilityOf(key), processes: this.#entries.size })
    void entry.started?.close()
    return true
  }

  // Only a server that ended on its own is still in the pool here: the pool forgets one before stopping it.
  #forget(key: string, relay: McpRelay) {
    const entry = this.#entries.get(key)
    if (!entry) return
    void entry.relay.then(current => {
      if (current !== relay || this.#entries.get(key) !== entry) return
      clearTimeout(entry.timer)
      this.#entries.delete(key)
      this.#counts.crashed++
    })
  }
}

function abilityOf(key: string): string {
  return key.slice(key.indexOf("\n") + 1)
}
