import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { McpReadOnlyRule } from "@kaja/schema/abilities"
import type { McpServerEntry } from "@kaja/schema/config"
import { randomUUIDv7 } from "@kaja/shared"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { write } from "bun"
import { type Tool, type ToolResult, tool } from "../agent/tools"
import type { FetchLike } from "../security/ssrf"

const MAX_ARGS_PREVIEW = 200

export type McpConnectOptions = {
  /** For a `url` server: Streamable HTTP (default) or the older SSE transport. */
  transport?: "http" | "sse"
  /** Only these of the server's tools (by MCP name) reach the model; unset means all. */
  allow?: string[]
  /** When calls ask first (see `Tool.approval`): `writes` asks unless the tool is annotated readOnlyHint (or `readOnly` says so). Default never. */
  approval?: "never" | "writes" | "always"
  /** Tools to treat as read-only under `writes` when the server doesn't mark them, each unless one of its `unless` arguments is set. */
  readOnly?: McpReadOnlyRule[]
  /** Leads the approval summary, e.g. `mcp:context7`. */
  label?: string
  /** Fetch for a `url` server's transport (the cloud passes its SSRF-guarded one). */
  fetch?: FetchLike
  /** Keep image results (saved under the temp dir). False drops them with a note: the cloud has nowhere to show them. Default true. */
  images?: boolean
  /** Cut a result's text at this many characters, with a note. Unset keeps it whole. */
  maxResultChars?: number
}

/** Whether a call counts as read-only under a manifest rule: the tool is listed and none of its `unless` arguments is set. */
function readOnlyByRule(rule: McpReadOnlyRule | undefined, args: Record<string, unknown> | undefined): boolean {
  if (!rule) return false
  return !rule.unless.some(key => args?.[key] !== undefined && args[key] !== null && args[key] !== "")
}

function approvalSummary(label: string, name: string, args: unknown): string {
  const json = JSON.stringify(args ?? {})
  const preview = json.length > MAX_ARGS_PREVIEW ? `${json.slice(0, MAX_ARGS_PREVIEW)}…` : json
  return `${label} ${name} ${preview}`
}

// A `url` server over Streamable HTTP (or SSE when asked), else a command started on this computer.
function createTransport(server: McpServerEntry, opts: McpConnectOptions) {
  if (!("url" in server)) {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...process.env, ...server.env } as Record<string, string>,
      stderr: "ignore"
    })
  }
  const init = { requestInit: { headers: server.headers }, ...(opts.fetch ? { fetch: opts.fetch } : {}) }
  return opts.transport === "sse"
    ? new SSEClientTransport(new URL(server.url), init)
    : new StreamableHTTPClientTransport(new URL(server.url), init)
}

export async function connectMcpServer(
  server: McpServerEntry,
  tempDir: string,
  opts: McpConnectOptions = {}
): Promise<{ tools: Tool<any>[]; close: () => Promise<void> }> {
  const transport = createTransport(server, opts)

  const client = new Client({ name: "kaja", version: "1.0.0" })
  await client.connect(transport)

  const { tools: mcpTools } = await client.listTools()
  const label = opts.label ?? `mcp:${server.id}`
  const tools = mcpTools
    .filter(mcpTool => !opts.allow || opts.allow.includes(mcpTool.name))
    .map(mcpTool => {
      const mcpToolDef = tool<Record<string, unknown>>({
        name: mcpTool.name,
        description: mcpTool.description ?? mcpTool.name,
        parameters: mcpTool.inputSchema,
        execute: args => callTool(client, mcpTool.name, args, tempDir, opts)
      })
      const rule = opts.readOnly?.find(r => r.tool === mcpTool.name)
      const mayAsk =
        opts.approval === "always" || (opts.approval === "writes" && mcpTool.annotations?.readOnlyHint !== true)
      if (!mayAsk) return mcpToolDef
      // TODO: smoother approvals: an "allow for this session" answer in the TUI/Telegram prompt, so a tool the user already approved stops asking until restart.
      // TODO: an "always allow" answer that writes the tool into the ability's readOnly (or a per-user override file), instead of hand-editing manifests.
      // TODO: show the tool's own description and its arguments as a readable list in the prompt, not a raw JSON preview.
      return {
        ...mcpToolDef,
        approval: (args: Record<string, unknown>) =>
          opts.approval === "writes" && readOnlyByRule(rule, args)
            ? undefined
            : approvalSummary(label, mcpTool.name, args)
      }
    })

  return { tools, close: () => client.close() }
}

/** `text` cut at `max` characters with a note, or whole when there's no limit. */
function capText(text: string, max: number | undefined): string {
  if (max === undefined || text.length <= max) return text
  return `${text.slice(0, max)}\n\n[cut: ${text.length} characters in total]`
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  tempDir: string,
  opts: Pick<McpConnectOptions, "images" | "maxResultChars">
): Promise<ToolResult> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  >

  const text = capText(
    content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map(block => block.text)
      .join("\n"),
    opts.maxResultChars
  )

  const imageBlocks = content.filter(
    (block): block is { type: "image"; data: string; mimeType: string } => block.type === "image"
  )
  if (imageBlocks.length === 0) return { text: text || `${name}: done` }
  if (opts.images === false) {
    const note = `(${imageBlocks.length} image${imageBlocks.length === 1 ? "" : "s"} not shown)`
    return { text: text ? `${text}\n\n${note}` : `${name}: done ${note}` }
  }

  await mkdir(tempDir, { recursive: true })
  const images = await Promise.all(
    imageBlocks.map(async block => {
      const ext = block.mimeType.split("/")[1] ?? "png"
      const path = join(tempDir, `${randomUUIDv7()}.${ext}`)
      await write(path, Buffer.from(block.data, "base64"))
      return { path, mimeType: block.mimeType }
    })
  )

  return { text: text || `${name}: done`, images }
}
