import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { McpServerEntry } from "@kaja/schema/config"
import { toolName } from "../../src/agent/tools"
import { connectMcpServer } from "../../src/mcp/client"
import { createTools } from "../../src/tools/registry"

const fixture: McpServerEntry = {
  id: "fixture",
  command: "bun",
  args: [join(import.meta.dir, "../fixtures/mcp-server.ts")],
  env: { FIXTURE_KEY: "from-env" }
}

test("the allowlist keeps only the named tools", async () => {
  const { tools, close } = await connectMcpServer(fixture, tmpdir(), { allow: ["read_thing", "echo_key"] })
  expect(tools.map(toolName)).toEqual(["read_thing", "echo_key"])
  expect(await tools[1]!.execute({})).toEqual({ text: "from-env" })
  await close()
})

test("approval: never asks for nothing, writes skips read-only tools, always asks for all", async () => {
  const asking = async (approval: "never" | "writes" | "always") => {
    const { tools, close } = await connectMcpServer(fixture, tmpdir(), { approval, label: "package:fixture" })
    await close()
    return tools.filter(t => t.approval).map(toolName)
  }
  expect(await asking("never")).toEqual([])
  expect(await asking("writes")).toEqual(["write_thing", "echo_key"])
  expect(await asking("always")).toEqual(["read_thing", "write_thing", "echo_key"])

  const { tools, close } = await connectMcpServer(fixture, tmpdir(), { approval: "always", label: "package:fixture" })
  await close()
  expect(tools[0]!.approval?.({ id: "7" })).toBe('package:fixture read_thing {"id":"7"}')
})

test("createTools connects packages as community tools and mcp.toml servers as third-party", async () => {
  const { tools, mcpServers, closeTools } = await createTools({
    includeLocalTools: true,
    tempDir: tmpdir(),
    mcpServers: [{ ...fixture, id: "own" }],
    mcpPackages: [{ name: "pkg", server: fixture, transport: "stdio", approval: "writes", allow: ["write_thing"] }]
  })
  const byName = new Map(tools.map(t => [toolName(t), t]))
  // The package's write_thing wins over mcp.toml's (community before third-party); its other tools are filtered out there.
  expect(byName.get("write_thing")).toMatchObject({ origin: "community", source: "package:pkg" })
  expect(byName.get("write_thing")?.approval).toBeDefined()
  expect(byName.get("read_thing")).toMatchObject({ origin: "third-party", source: "mcp:own" })
  expect(mcpServers).toEqual([
    { id: "own", toolCount: 3, failed: false },
    { id: "package:pkg", toolCount: 1, failed: false }
  ])
  await closeTools()
})

test("a server that doesn't answer in time is skipped without holding up the others", async () => {
  const started = Date.now()
  const { tools, mcpServers, closeTools } = await createTools({
    includeLocalTools: true,
    tempDir: tmpdir(),
    mcpConnectTimeoutMs: 1_500,
    mcpServers: [{ id: "silent", command: "sleep", args: ["30"], env: {} }, fixture]
  })
  expect(Date.now() - started).toBeLessThan(5_000)
  expect(mcpServers.find(s => s.id === "silent")).toMatchObject({ failed: true, toolCount: 0 })
  expect(tools.some(t => toolName(t) === "read_thing")).toBe(true)
  await closeTools()
})
