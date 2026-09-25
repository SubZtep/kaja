import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { McpAbilitySchema } from "@kaja/schema/abilities"
import { loadAbilities } from "../../src/abilities/load"
import { checkMcpAbilityKey, mcpAbilityTarget } from "../../src/abilities/mcp-ability"
import type { AbilityStore } from "../../src/abilities/types"
import { toolName } from "../../src/agent/tools"
import { connectMcpServer } from "../../src/mcp/client"
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

const remoteAbility = (over: Record<string, unknown> = {}) =>
  McpAbilitySchema.parse({
    name: "things",
    description: "Things",
    transport: "http",
    url: `https://${HOST}/mcp`,
    approval: "writes",
    tools: ["read_thing", "write_thing", "picture", "long_answer"],
    ...over
  })

const stdioAbility = McpAbilitySchema.parse({
  name: "local-things",
  description: "Local things",
  transport: "stdio",
  command: "bun",
  args: [join(import.meta.dir, "../fixtures/mcp-server.ts")]
})

test("the cloud connects only remote abilities, through its fetch, never mcp.toml servers or stdio abilities", async () => {
  const { tools, mcpServers, closeTools } = await createTools({
    mcpAbilities: [mcpAbilityTarget(remoteAbility()), mcpAbilityTarget(stdioAbility)],
    mcpServers: [{ id: "configured", url: `https://${HOST}/mcp`, headers: {} }],
    mcpFetch: routeHostTo(open, HOST)
  })
  try {
    expect(mcpServers).toEqual([{ id: "ability:things", toolCount: 4, failed: false }])
    const names = tools.map(toolName)
    expect(names).toEqual(expect.arrayContaining(["read_thing", "write_thing", "picture", "long_answer"]))
    const write = tools.find(t => toolName(t) === "write_thing")!
    expect(write.approval?.({ id: "1" })).toBe('ability:things write_thing {"id":"1"}')
    expect(tools.find(t => toolName(t) === "read_thing")!.approval).toBeUndefined()
  } finally {
    await closeTools()
  }
})

test("without the guarded fetch the cloud connects nothing", async () => {
  const { mcpServers } = await createTools({ mcpAbilities: [mcpAbilityTarget(remoteAbility())] })
  expect(mcpServers).toEqual([])
})

test("cloud results drop images with a note and cut long text", async () => {
  const { tools, closeTools } = await createTools({
    mcpAbilities: [mcpAbilityTarget(remoteAbility())],
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
  const ability = remoteAbility({ auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " } })
  const fetch = routeHostTo(keyed, HOST)
  expect(await checkMcpAbilityKey(ability, "right-key", { fetch })).toEqual({ ok: true })
  const wrong = await checkMcpAbilityKey(ability, "wrong-key-123", { fetch })
  expect(wrong.ok).toBe(false)
  expect(JSON.stringify(wrong)).not.toContain("wrong-key-123")
})

test("with an image dir, cloud results keep images for the model", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaja-cloud-images-"))
  const { tools, closeTools } = await createTools({
    mcpAbilities: [mcpAbilityTarget(remoteAbility())],
    mcpFetch: routeHostTo(open, HOST),
    mcpImageDir: dir
  })
  try {
    const result = (await tools.find(t => toolName(t) === "picture")!.execute({})) as {
      text: string
      images: { path: string }[]
    }
    expect(result.text).toBe("a picture")
    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.path.startsWith(dir)).toBe(true)
  } finally {
    await closeTools()
    await rm(dir, { recursive: true, force: true })
  }
})

test("with a sandbox, a stdio ability connects to <sandbox>/mcp/<name> with the caller's token", async () => {
  const store: AbilityStore = {
    listSkills: async () => [],
    readSkill: async () => undefined,
    listHttpTools: async () => [],
    listMcpAbilities: async () => [{ ...stdioAbility, tools: ["read_thing"] }, remoteAbility()]
  }
  const { mcp } = await loadAbilities(store, {
    mcpSandbox: { url: "http://sandbox.test:3002/", token: async name => `token-for-${name}` }
  })
  expect(mcp[0]).toMatchObject({
    name: "local-things",
    transport: "http",
    sandboxed: true,
    allow: ["read_thing"],
    server: {
      url: "http://sandbox.test:3002/mcp/local-things",
      headers: { Authorization: "Bearer token-for-local-things" }
    }
  })
  expect(mcp[1]).toMatchObject({ name: "things", server: { url: `https://${HOST}/mcp` } })
  expect(mcp[1]!.sandboxed).toBeUndefined()
})

test("an image over the size cap is dropped with a note", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaja-cloud-images-"))
  const target = mcpAbilityTarget(remoteAbility())
  const connection = await connectMcpServer(target.server, dir, { fetch: routeHostTo(open, HOST), maxImageBytes: 1 })
  try {
    const picture = connection.tools.find(t => toolName(t) === "picture")!
    expect(await picture.execute({})).toEqual({ text: "a picture\n\n(1 image not shown)" })
  } finally {
    await connection.close()
    await rm(dir, { recursive: true, force: true })
  }
})
