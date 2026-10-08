// Lists the tools of the MCP server a marketplace manifest describes, over plain JSON-RPC (no dependencies).
// Usage: bun .claude/skills/add-mcp/scripts/list-tools.ts ../marketplace/abilities/<name>/mcp.toml
// A key, when the server needs one, comes from MCP_KEY and goes where the manifest's [auth] says; it is never printed.
export {}

type Auth = { type: string; in?: string; name?: string; prefix?: string }
type Manifest = {
  name?: string
  transport?: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  auth?: Auth
}
type Tool = {
  name: string
  description?: string
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] }
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}
type ToolsPage = { tools: Tool[]; nextCursor?: string }
type JsonRpcRequest = { jsonrpc: "2.0"; id: number; method: string; params: object }
type JsonRpcNotification = { jsonrpc: "2.0"; method: string }
type JsonRpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: number; message: string } }

const USAGE =
  "usage: bun .claude/skills/add-mcp/scripts/list-tools.ts <manifest.toml>  (MCP_KEY=<key> for a keyed server)"
/** First runs of npx/bunx/uvx download the package, so a stdio server gets a long time to answer. */
const STDIO_TIMEOUT_MS = 180_000
const HTTP_TIMEOUT_MS = 60_000
/** Descriptions are cut to this many characters; the full text isn't needed to pick tools. */
const DESCRIPTION_CHARS = 300

const INITIALIZE: JsonRpcRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "kaja-add-mcp", version: "1.0.0" } }
}
const INITIALIZED: JsonRpcNotification = { jsonrpc: "2.0", method: "notifications/initialized" }
const listTools = (id: number, cursor?: string): JsonRpcRequest => ({
  jsonrpc: "2.0",
  id,
  method: "tools/list",
  params: cursor ? { cursor } : {}
})

class UsageError extends Error {}

try {
  const path = Bun.argv[2]
  if (!path || path === "--help" || path === "-h") throw new UsageError(USAGE)
  const file = Bun.file(path)
  if (!(await file.exists())) throw new UsageError(`no such manifest: ${path}\n${USAGE}`)
  const manifest = Bun.TOML.parse(await file.text()) as Manifest
  const tools = (manifest.transport ?? "http") === "stdio" ? await viaStdio(manifest) : await viaHttp(manifest)
  console.log(JSON.stringify(tools.map(summarize), null, 2))
  process.exit(0)
} catch (error) {
  console.error(`list-tools: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(error instanceof UsageError ? 2 : 1)
}

/** What choosing `tools`, `approval`, `readOnly` and `localOnlyArgs` needs from a tool. */
function summarize(tool: Tool) {
  const required = new Set(tool.inputSchema?.required ?? [])
  return {
    name: tool.name,
    readOnlyHint: tool.annotations?.readOnlyHint,
    destructiveHint: tool.annotations?.destructiveHint,
    args: Object.keys(tool.inputSchema?.properties ?? {}).map(arg => (required.has(arg) ? arg : `${arg}?`)),
    description: tool.description?.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_CHARS)
  }
}

/** The key as a header or env entry, when the manifest puts it `where`. */
function keyEntry(manifest: Manifest, where: "env" | "header"): Record<string, string> {
  const key = Bun.env.MCP_KEY
  const auth = manifest.auth
  if (!key || auth?.type !== "apiKey" || auth.in !== where || !auth.name) return {}
  return { [auth.name]: `${auth.prefix ?? ""}${key}` }
}

/** Every page of tools/list, through `request`. */
async function allTools(request: (message: JsonRpcRequest) => Promise<unknown>): Promise<Tool[]> {
  const tools: Tool[] = []
  let cursor: string | undefined
  for (let id = 2; ; id++) {
    const page = (await request(listTools(id, cursor))) as ToolsPage
    tools.push(...(page.tools ?? []))
    cursor = page.nextCursor
    if (!cursor) return tools
  }
}

function rpcError(response: JsonRpcResponse): Error {
  return new Error(`server error ${response.error?.code}: ${response.error?.message}`)
}

async function viaStdio(manifest: Manifest): Promise<Tool[]> {
  if (!manifest.command) throw new Error("a stdio manifest needs a command")
  const child = Bun.spawn([manifest.command, ...(manifest.args ?? [])], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...Bun.env, ...manifest.env, ...keyEntry(manifest, "env") }
  })
  const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>()
  const failAll = (error: Error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }

  // Newline-delimited JSON-RPC on stdout; anything else there (a server's stray logging) is skipped.
  void (async () => {
    let buffer = ""
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      buffer += chunk
      for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        let message: JsonRpcResponse
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        const waiter = pending.get(message.id)
        if (!waiter) continue
        pending.delete(message.id)
        if (message.error) waiter.reject(rpcError(message))
        else waiter.resolve(message.result)
      }
    }
  })()
  void child.exited.then(code => failAll(new Error(`the server exited (code ${code}) before answering`)))

  const request = (message: JsonRpcRequest) =>
    new Promise<unknown>((resolve, reject) => {
      pending.set(message.id, { resolve, reject })
      child.stdin.write(`${JSON.stringify(message)}\n`)
    })
  const timer = setTimeout(
    () => failAll(new Error(`no answer after ${STDIO_TIMEOUT_MS / 1000}s (first runs download the package)`)),
    STDIO_TIMEOUT_MS
  )
  try {
    await request(INITIALIZE)
    child.stdin.write(`${JSON.stringify(INITIALIZED)}\n`)
    return await allTools(request)
  } finally {
    clearTimeout(timer)
    child.kill()
  }
}

async function viaHttp(manifest: Manifest): Promise<Tool[]> {
  const url = manifest.url
  if (!url) throw new Error("an http or sse manifest needs a url")
  if (manifest.transport === "sse") {
    throw new Error("legacy sse isn't supported here; take the tool names from the server's docs")
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...manifest.headers,
    ...keyEntry(manifest, "header")
  }
  let session: string | null = null

  const post = async (message: JsonRpcRequest | JsonRpcNotification): Promise<unknown> => {
    const response = await fetch(url, {
      method: "POST",
      headers: session ? { ...headers, "mcp-session-id": session } : headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
    })
    session ??= response.headers.get("mcp-session-id")
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
    if (!("id" in message)) return undefined
    const text = await response.text()
    // A Streamable HTTP server may answer as a JSON body or as an SSE stream holding the response event.
    const answer: JsonRpcResponse | undefined = response.headers.get("content-type")?.includes("text/event-stream")
      ? text
          .split("\n")
          .filter(line => line.startsWith("data:"))
          .map(line => JSON.parse(line.slice(5)) as JsonRpcResponse)
          .find(event => event.id === message.id)
      : (JSON.parse(text) as JsonRpcResponse)
    if (!answer) throw new Error(`no answer to ${message.method} in the event stream`)
    if (answer.error) throw rpcError(answer)
    return answer.result
  }

  await post(INITIALIZE)
  await post(INITIALIZED)
  return allTools(post)
}
