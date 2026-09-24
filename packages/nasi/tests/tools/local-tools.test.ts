import { expect, test } from "bun:test"
import { toolName } from "../../src/agent/tools"
import { createTools } from "../../src/tools/registry"

/** Never available in cloud mode — no client-side round trip exists for these. */
const LOCAL_ONLY = ["run_command", "view_image"]

/** Visible to the model in both modes, but only really execute locally — cloud gets a stub that pauses the turn instead (see registry.ts's CLIENT_EXECUTABLE). */
const CLIENT_EXECUTABLE = ["read_file", "list_files"]

test("local-only tools are off by default", async () => {
  const { tools, mcpServers, closeTools } = await createTools()
  const names = tools.map(t => toolName(t))
  for (const banned of LOCAL_ONLY) expect(names).not.toContain(banned)
  expect(names).toContain("ask_user")
  expect(mcpServers).toEqual([])
  await closeTools()
})

test("read_file/list_files are exposed in cloud mode as client-execution stubs", async () => {
  const { tools, closeTools } = await createTools()
  for (const name of CLIENT_EXECUTABLE) {
    const t = tools.find(candidate => toolName(candidate) === name)
    expect(t).toBeDefined()
    expect(t?.requiresClientExecution).toBe(true)
    await expect(t!.execute({} as never)).rejects.toThrow()
  }
  await closeTools()
})

test("clientTools: false leaves read_file/list_files out of a cloud turn", async () => {
  const { tools, closeTools } = await createTools({ clientTools: false })
  const names = tools.map(t => toolName(t))
  for (const name of CLIENT_EXECUTABLE) expect(names).not.toContain(name)
  expect(names).toContain("ask_user")
  await closeTools()
})

test("includeLocalTools registers files and shell with their real implementations", async () => {
  const { tools, closeTools } = await createTools({ includeLocalTools: true })
  const byName = new Map(tools.map(t => [toolName(t), t]))
  for (const name of [...LOCAL_ONLY, ...CLIENT_EXECUTABLE]) expect(byName.has(name)).toBe(true)
  for (const name of CLIENT_EXECUTABLE) expect(byName.get(name)?.requiresClientExecution).toBeUndefined()
  expect(byName.has("ask_user")).toBe(true)
  await closeTools()
})

test("cloud fetch_url is off without a proxy", async () => {
  const { tools, closeTools } = await createTools()
  expect(tools.map(t => toolName(t))).not.toContain("fetch_url")
  await closeTools()
})

test("cloud fetch_url is on with a proxy", async () => {
  const { tools, closeTools } = await createTools({ deps: { fetchProxy: "http://proxy.example.com:8080" } })
  expect(tools.map(t => toolName(t))).toContain("fetch_url")
  await closeTools()
})

test("local fetch_url needs no proxy", async () => {
  const { tools, closeTools } = await createTools({ includeLocalTools: true })
  expect(tools.map(t => toolName(t))).toContain("fetch_url")
  await closeTools()
})
