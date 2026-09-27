// Lists an MCP manifest's tools over plain JSON-RPC (no deps): bun .claude/skills/add-mcp/scripts/list-tools.ts marketplace/mcp/<name>.toml
// A key, if the server needs one, comes from MCP_KEY and goes where the manifest's auth says.
type Auth = { type: string; in?: string; name?: string; prefix?: string }
type Manifest = {
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
  inputSchema?: { properties?: Record<string, unknown> }
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}

const path = Bun.argv[2]
if (!path) throw new Error("usage: list-tools.ts <manifest.toml>")
const manifest = Bun.TOML.parse(await Bun.file(path).text()) as Manifest
const key = Bun.env.MCP_KEY
const auth = manifest.auth
const keyed = (where: string) =>
  key && auth?.type === "apiKey" && auth.in === where && auth.name ? { [auth.name]: `${auth.prefix ?? ""}${key}` } : {}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "kaja-add-mcp", version: "0" } }
}
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" }
const listTools = (id: number, cursor?: string) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/list",
  params: cursor ? { cursor } : {}
})

const tools = (manifest.transport ?? "http") === "stdio" ? await viaStdio() : await viaHttp()
console.log(
  JSON.stringify(
    tools.map(t => ({
      name: t.name,
      readOnlyHint: t.annotations?.readOnlyHint,
      destructiveHint: t.annotations?.destructiveHint,
      args: Object.keys(t.inputSchema?.properties ?? {}),
      description: t.description?.slice(0, 300)
    })),
    null,
    2
  )
)
process.exit(0)

async function viaStdio(): Promise<Tool[]> {
  if (!manifest.command) throw new Error("stdio manifest without a command")
  const child = Bun.spawn([manifest.command, ...(manifest.args ?? [])], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...Bun.env, ...manifest.env, ...keyed("env") }
  })
  const pending = new Map<number, (result: unknown) => void>()
  void (async () => {
    let buffer = ""
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      buffer += chunk
      let newline = buffer.indexOf("\n")
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf("\n")
        if (!line.startsWith("{")) continue
        const message = JSON.parse(line)
        if (message.error) throw new Error(JSON.stringify(message.error))
        if (typeof message.id === "number") pending.get(message.id)?.(message.result)
      }
    }
  })()
  const request = (message: { id: number }) =>
    new Promise<any>(resolve => {
      pending.set(message.id, resolve)
      child.stdin.write(`${JSON.stringify(message)}\n`)
    })
  const timer = setTimeout(() => {
    console.error("timed out after 180s (first runs download the package)")
    process.exit(1)
  }, 180_000)
  await request(initialize)
  child.stdin.write(`${JSON.stringify(initialized)}\n`)
  const all: Tool[] = []
  let cursor: string | undefined
  for (let id = 2; ; id++) {
    const page = await request(listTools(id, cursor))
    all.push(...page.tools)
    cursor = page.nextCursor
    if (!cursor) break
  }
  clearTimeout(timer)
  child.kill()
  return all
}

async function viaHttp(): Promise<Tool[]> {
  if (!manifest.url) throw new Error("http/sse manifest without a url")
  if (manifest.transport === "sse")
    throw new Error("legacy sse isn't supported here; read the tool names from the server's docs")
  const base = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...manifest.headers,
    ...keyed("header")
  }
  let session: string | null = null
  const post = async (message: object) => {
    const response = await fetch(manifest.url as string, {
      method: "POST",
      headers: session ? { ...base, "mcp-session-id": session } : base,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(60_000)
    })
    session ??= response.headers.get("mcp-session-id")
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
    if (!("id" in message)) return undefined
    const text = await response.text()
    const json = response.headers.get("content-type")?.includes("text/event-stream")
      ? text
          .split("\n")
          .filter(l => l.startsWith("data:"))
          .map(l => JSON.parse(l.slice(5)))
          .find(m => m.id === (message as { id: number }).id)
      : JSON.parse(text)
    if (json.error) throw new Error(JSON.stringify(json.error))
    return json.result
  }
  await post(initialize)
  await post(initialized)
  const all: Tool[] = []
  let cursor: string | undefined
  for (let id = 2; ; id++) {
    const page = await post(listTools(id, cursor))
    all.push(...page.tools)
    cursor = page.nextCursor
    if (!cursor) break
  }
  return all
}
