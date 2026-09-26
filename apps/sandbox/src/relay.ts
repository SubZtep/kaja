import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import {
  isInitializedNotification,
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type RequestId
} from "@modelcontextprotocol/sdk/types.js"
import type { SandboxServer } from "./manifests"
import { reportError } from "./report"

/** Each turn opens a session and seldom ends it, so the oldest ones past this many are closed. */
const MAX_SESSIONS = 16
const METHOD_NOT_FOUND = -32601
const UNREACHABLE = { error: { code: -32000, message: "the MCP server isn't running" } }
/** How many of the server's last stderr lines go with a report. */
const STDERR_LINES = 20

type Reply = { result?: unknown; error?: { code: number; message: string; data?: unknown } }
type Pending =
  | { session: WebStandardStreamableHTTPServerTransport; id: RequestId }
  | { resolve: (reply: Reply) => void }

/**
 * One running stdio MCP server shared by any number of Streamable HTTP sessions (a new one each turn), relaying raw
 * JSON-RPC: request ids are renumbered on the way in so sessions can't collide, and answers go back to whoever asked.
 * The server is initialized once; later sessions get that first answer, so its state (a browser's open pages) lives on.
 */
export class McpRelay {
  readonly #child: StdioClientTransport
  readonly #home: string
  readonly #name: string
  readonly #stderr: string[] = []
  readonly #sessions = new Map<string, WebStandardStreamableHTTPServerTransport>()
  readonly #pending = new Map<number, Pending>()
  #nextId = 1
  #initialize: Promise<Reply> | undefined
  #initializedSent = false
  #closed = false
  /** Called once the server process is gone, whoever ended it. */
  onclose?: () => void

  private constructor(child: StdioClientTransport, home: string, name: string) {
    this.#child = child
    this.#home = home
    this.#name = name
  }

  /** Starts the server with a throwaway HOME and nothing from the sandbox's own environment but PATH. */
  static async start(server: SandboxServer): Promise<McpRelay> {
    const home = await mkdtemp(join(tmpdir(), `kaja-sandbox-${server.name}-`))
    const child = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: home, ...server.env },
      cwd: home,
      stderr: "pipe"
    })
    const relay = new McpRelay(child, home, server.name)
    child.stderr?.on("data", (chunk: Buffer) => relay.#keepStderr(chunk))
    child.onmessage = message => relay.#fromChild(message)
    child.onclose = () => {
      // The relay closes first when it stops the server itself, so a close that finds it open is a crash.
      if (!relay.#closed) reportError("Sandbox MCP server exited", new Error(`${server.name} exited`), relay.#details())
      void relay.close()
    }
    child.onerror = error => reportError("Sandbox MCP server error", error, relay.#details())
    try {
      await child.start()
    } catch (error) {
      await rm(home, { recursive: true, force: true })
      throw error
    }
    return relay
  }

  /** Whether a request is still waiting on the server, so it isn't stopped mid-call. */
  get busy(): boolean {
    return this.#pending.size > 0
  }

  /** Requests waiting on the server right now. */
  get pending(): number {
    return this.#pending.size
  }

  /** Open Streamable HTTP sessions. */
  get sessions(): number {
    return this.#sessions.size
  }

  /** The server's process id, while it runs. */
  get pid(): number | null {
    return this.#child.pid
  }

  /** Serves one HTTP request: an existing session's, or a new session's `initialize` (404 for a session this relay doesn't have). */
  async handle(request: Request): Promise<Response> {
    const sessionId = request.headers.get("mcp-session-id")
    if (sessionId) {
      const session = this.#sessions.get(sessionId)
      if (!session) return Response.json({ error: "unknown session" }, { status: 404 })
      return session.handleRequest(request)
    }
    return this.#openSession().handleRequest(request)
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    for (const session of this.#sessions.values()) await session.close().catch(() => {})
    this.#sessions.clear()
    for (const pending of this.#pending.values()) if ("resolve" in pending) pending.resolve(UNREACHABLE)
    this.#pending.clear()
    await this.#child.close().catch(() => {})
    await rm(this.#home, { recursive: true, force: true })
    this.onclose?.()
  }

  #keepStderr(chunk: Buffer) {
    this.#stderr.push(...chunk.toString().split("\n").filter(Boolean))
    this.#stderr.splice(0, this.#stderr.length - STDERR_LINES)
  }

  #details(): Record<string, unknown> {
    return { server: this.#name, stderr: this.#stderr.join("\n") }
  }

  #openSession(): WebStandardStreamableHTTPServerTransport {
    const session: WebStandardStreamableHTTPServerTransport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: id => {
        this.#sessions.set(id, session)
        this.#trimSessions()
      },
      onsessionclosed: id => {
        this.#sessions.delete(id)
      }
    })
    session.onmessage = message => void this.#fromSession(session, message)
    void session.start()
    return session
  }

  #trimSessions() {
    for (const [id, session] of this.#sessions) {
      if (this.#sessions.size <= MAX_SESSIONS) return
      this.#sessions.delete(id)
      void session.close().catch(() => {})
    }
  }

  async #fromSession(session: WebStandardStreamableHTTPServerTransport, message: JSONRPCMessage) {
    if (isJSONRPCRequest(message) && message.method === "initialize") {
      const reply = await this.#initializeOnce(message)
      await this.#reply(session, message.id, reply)
      return
    }
    if (isJSONRPCRequest(message)) {
      const id = this.#nextId++
      this.#pending.set(id, { session, id: message.id })
      if (await this.#send({ ...message, id })) return
      this.#pending.delete(id)
      await this.#reply(session, message.id, UNREACHABLE)
      return
    }
    if (isInitializedNotification(message)) {
      if (this.#initializedSent) return
      this.#initializedSent = true
      await this.#send(message)
      return
    }
    if (isJSONRPCNotification(message)) {
      if (message.method === "notifications/cancelled") {
        const childId = this.#childIdOf(session, message.params?.requestId as RequestId | undefined)
        if (childId === undefined) return
        await this.#send({ ...message, params: { ...message.params, requestId: childId } })
        return
      }
      await this.#send(message)
    }
    // Answers to server-to-client requests never come here: the relay answers those itself.
  }

  #fromChild(message: JSONRPCMessage) {
    if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
      const pending = typeof message.id === "number" ? this.#pending.get(message.id) : undefined
      if (!pending) return
      this.#pending.delete(message.id as number)
      const reply: Reply = isJSONRPCErrorResponse(message) ? { error: message.error } : { result: message.result }
      if ("resolve" in pending) pending.resolve(reply)
      else void this.#reply(pending.session, pending.id, reply)
      return
    }
    // No client behind the relay can answer sampling, roots or elicitation; only a ping gets a real answer.
    if (isJSONRPCRequest(message)) {
      const reply: Reply =
        message.method === "ping"
          ? { result: {} }
          : { error: { code: METHOD_NOT_FOUND, message: `${message.method} isn't supported by the sandbox` } }
      void this.#send({ jsonrpc: "2.0", id: message.id, ...reply } as JSONRPCMessage)
      return
    }
    // Notifications (progress, list changes, logs) go to every session; one without a listening stream just drops it.
    for (const session of this.#sessions.values()) void session.send(message).catch(() => {})
  }

  /** The server's `initialize` answer: asked for once, then shared; a failed one is asked again next time. */
  #initializeOnce(message: JSONRPCRequest): Promise<Reply> {
    this.#initialize ??= new Promise<Reply>(resolve => {
      const id = this.#nextId++
      this.#pending.set(id, { resolve })
      void this.#send({ ...message, id }).then(sent => {
        if (sent || !this.#pending.delete(id)) return
        resolve(UNREACHABLE)
      })
    }).then(reply => {
      if (reply.error) this.#initialize = undefined
      return reply
    })
    return this.#initialize
  }

  #childIdOf(session: WebStandardStreamableHTTPServerTransport, requestId: RequestId | undefined): number | undefined {
    for (const [childId, pending] of this.#pending)
      if ("session" in pending && pending.session === session && pending.id === requestId) return childId
    return undefined
  }

  async #reply(session: WebStandardStreamableHTTPServerTransport, id: RequestId, reply: Reply) {
    await session.send({ jsonrpc: "2.0", id, ...reply } as JSONRPCMessage).catch(() => {})
  }

  /** Whether the message reached the server. */
  async #send(message: JSONRPCMessage): Promise<boolean> {
    try {
      await this.#child.send(message)
      return true
    } catch (error) {
      console.warn("Sandbox couldn't reach its MCP server", { error: error instanceof Error ? error.message : error })
      return false
    }
  }
}
