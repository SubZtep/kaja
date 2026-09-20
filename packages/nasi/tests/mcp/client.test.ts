import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { McpServerEntry } from "@kaja/schema/config"
import { toolName } from "../../src/agent/tools"
import { connectMcpServer, type McpConnectOptions } from "../../src/mcp/client"
import { createTools } from "../../src/tools/registry"

// Every test here spawns real server processes; starting one takes ~1 s on a busy machine, so give them room (this also applies when this package's tests run on their own, without the root preload).
const SPAWN_TIMEOUT = 30_000

const fixture: McpServerEntry = {
  id: "fixture",
  command: "bun",
  args: [join(import.meta.dir, "../fixtures/mcp-server.ts")],
  env: { FIXTURE_KEY: "from-env" }
}

/** Connects, reads the tool list, and disconnects straight away (approval checks don't need a live server). */
async function toolsWith(opts: McpConnectOptions) {
  const { tools, close } = await connectMcpServer(fixture, tmpdir(), opts)
  await close()
  return tools
}

test(
  "the allowlist keeps only the named tools",
  async () => {
    const { tools, close } = await connectMcpServer(fixture, tmpdir(), { allow: ["read_thing", "echo_key"] })
    expect(tools.map(toolName)).toEqual(["read_thing", "echo_key"])
    expect(await tools[1]!.execute({})).toEqual({ text: "from-env" })
    await close()
  },
  SPAWN_TIMEOUT
)

test(
  "approval: never asks for nothing, writes skips read-only tools, always asks for all",
  async () => {
    const label = "ability:fixture"
    const [never, writes, always] = await Promise.all([
      toolsWith({ approval: "never", label }),
      toolsWith({ approval: "writes", label }),
      toolsWith({ approval: "always", label })
    ])
    const asking = (tools: Awaited<ReturnType<typeof toolsWith>>) => tools.filter(t => t.approval).map(toolName)
    expect(asking(never)).toEqual([])
    expect(asking(writes)).toEqual(["write_thing", "echo_key"])
    expect(asking(always)).toEqual(["read_thing", "write_thing", "echo_key"])
    expect(always[0]!.approval?.({ id: "7" })).toBe('ability:fixture read_thing {"id":"7"}')
  },
  SPAWN_TIMEOUT
)

test(
  "readOnly rules stop writes-approval for a listed tool, unless one of its `unless` arguments is set",
  async () => {
    const readOnly = [
      { tool: "write_thing", unless: ["id"] },
      { tool: "echo_key", unless: [] }
    ]
    const [writes, always] = await Promise.all([
      toolsWith({ approval: "writes", readOnly }),
      toolsWith({ approval: "always", readOnly })
    ])
    const byName = new Map(writes.map(t => [toolName(t), t]))
    expect(byName.get("write_thing")!.approval?.({})).toBeUndefined()
    expect(byName.get("write_thing")!.approval?.({ id: "" })).toBeUndefined()
    expect(byName.get("write_thing")!.approval?.({ id: "7" })).toContain("write_thing")
    expect(byName.get("echo_key")!.approval?.({})).toBeUndefined()
    // "always" means always: readOnly rules only soften "writes".
    expect(always.find(t => toolName(t) === "echo_key")!.approval?.({})).toContain("echo_key")
  },
  SPAWN_TIMEOUT
)

test(
  "createTools connects abilities as community tools and mcp.toml servers as third-party",
  async () => {
    const { tools, mcpServers, closeTools } = await createTools({
      includeLocalTools: true,
      tempDir: tmpdir(),
      mcpServers: [{ ...fixture, id: "own" }],
      mcpAbilities: [
        { name: "ability", server: fixture, transport: "stdio", approval: "writes", allow: ["write_thing"] }
      ]
    })
    const byName = new Map(tools.map(t => [toolName(t), t]))
    // The ability's write_thing wins over mcp.toml's (community before third-party); its other tools are filtered out there.
    expect(byName.get("write_thing")).toMatchObject({ origin: "community", source: "ability:ability" })
    expect(byName.get("write_thing")?.approval).toBeDefined()
    expect(byName.get("read_thing")).toMatchObject({ origin: "third-party", source: "mcp:own" })
    expect(mcpServers).toEqual([
      { id: "own", toolCount: 3, failed: false },
      { id: "ability:ability", toolCount: 1, failed: false }
    ])
    await closeTools()
  },
  SPAWN_TIMEOUT
)

test(
  "servers that don't answer are skipped after the timeout, all at once rather than one after another",
  async () => {
    // Two silent servers with a 1 s limit: in parallel that's ~1 s, one after another it would be 2 s or more.
    const silent = (id: string): McpServerEntry => ({ id, command: "sleep", args: ["30"], env: {} })
    const started = Date.now()
    const { mcpServers, closeTools } = await createTools({
      includeLocalTools: true,
      tempDir: tmpdir(),
      mcpConnectTimeoutMs: 1_000,
      mcpServers: [silent("a"), silent("b")]
    })
    expect(Date.now() - started).toBeLessThan(1_900)
    expect(mcpServers).toEqual([
      { id: "a", toolCount: 0, failed: true },
      { id: "b", toolCount: 0, failed: true }
    ])
    await closeTools()
  },
  SPAWN_TIMEOUT
)

test(
  "a server that fails doesn't stop the others from loading",
  async () => {
    const { tools, mcpServers, closeTools } = await createTools({
      includeLocalTools: true,
      tempDir: tmpdir(),
      mcpServers: [{ id: "broken", command: "kaja-test-no-such-command", args: [], env: {} }, fixture]
    })
    expect(mcpServers.find(s => s.id === "broken")).toMatchObject({ failed: true, toolCount: 0 })
    expect(tools.some(t => toolName(t) === "read_thing")).toBe(true)
    await closeTools()
  },
  SPAWN_TIMEOUT
)
