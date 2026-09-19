import { afterAll, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { McpPackageSchema } from "@kaja/schema/packages"
import { toolName } from "../../src/agent/tools"
import { checkMcpPackageKey, mcpPackageTarget } from "../../src/packages/mcp-package"
import { createTools } from "../../src/tools/registry"
import { type HttpMcpFixture, routeHostTo, startHttpMcpFixture } from "../fixtures/mcp-http-server"

const HOST = "mcp.example.test"
let open: HttpMcpFixture
let keyed: HttpMcpFixture

beforeAll(() => {
  open = startHttpMcpFixture()
  keyed = startHttpMcpFixture({ apiKey: "right-key" })
})

afterAll(() => {
  open.stop()
  keyed.stop()
})

const remotePackage = (over: Record<string, unknown> = {}) =>
  McpPackageSchema.parse({
    name: "things",
    description: "Things",
    transport: "http",
    url: `https://${HOST}/mcp`,
    approval: "writes",
    tools: ["read_thing", "write_thing", "picture", "long_answer"],
    ...over
  })

const stdioPackage = McpPackageSchema.parse({
  name: "local-things",
  description: "Local things",
  transport: "stdio",
  command: "bun",
  args: [join(import.meta.dir, "../fixtures/mcp-server.ts")]
})

test("the cloud connects only remote packages, through its fetch, never mcp.toml servers or stdio packages", async () => {
  const { tools, mcpServers, closeTools } = await createTools({
    mcpPackages: [mcpPackageTarget(remotePackage()), mcpPackageTarget(stdioPackage)],
    mcpServers: [{ id: "configured", url: `https://${HOST}/mcp`, headers: {} }],
    mcpFetch: routeHostTo(open, HOST)
  })
  try {
    expect(mcpServers).toEqual([{ id: "package:things", toolCount: 4, failed: false }])
    const names = tools.map(toolName)
    expect(names).toEqual(expect.arrayContaining(["read_thing", "write_thing", "picture", "long_answer"]))
    const write = tools.find(t => toolName(t) === "write_thing")!
    expect(write.approval?.({ id: "1" })).toBe('package:things write_thing {"id":"1"}')
    expect(tools.find(t => toolName(t) === "read_thing")!.approval).toBeUndefined()
  } finally {
    await closeTools()
  }
})

test("without the guarded fetch the cloud connects nothing", async () => {
  const { mcpServers } = await createTools({ mcpPackages: [mcpPackageTarget(remotePackage())] })
  expect(mcpServers).toEqual([])
})

test("cloud results drop images with a note and cut long text", async () => {
  const { tools, closeTools } = await createTools({
    mcpPackages: [mcpPackageTarget(remotePackage())],
    mcpFetch: routeHostTo(open, HOST)
  })
  try {
    const run = (name: string) => tools.find(t => toolName(t) === name)!.execute({})
    expect(await run("picture")).toEqual({ text: "a picture\n\n(1 image not shown)" })
    const long = (await run("long_answer")) as { text: string }
    expect(long.text).toEndWith("[cut: 40000 characters in total]")
    expect(long.text.length).toBeLessThan(33 * 1024)
  } finally {
    await closeTools()
  }
})

test("a key is checked by connecting and listing tools, and never shows in the reason", async () => {
  const pkg = remotePackage({ auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " } })
  const fetch = routeHostTo(keyed, HOST)
  expect(await checkMcpPackageKey(pkg, "right-key", { fetch })).toEqual({ ok: true })
  const wrong = await checkMcpPackageKey(pkg, "wrong-key-123", { fetch })
  expect(wrong.ok).toBe(false)
  expect(JSON.stringify(wrong)).not.toContain("wrong-key-123")
})
