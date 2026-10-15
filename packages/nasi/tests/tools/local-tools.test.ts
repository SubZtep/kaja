import { expect, test } from "bun:test"
import { toolName } from "../../src/agent/tools"
import { createTools } from "../../src/tools/registry"

/** Never available in cloud mode: the user's machine isn't the cloud's to touch. */
const LOCAL_ONLY = ["run_command", "view_image", "read_file", "list_files"]

test("local-only tools are off by default", async () => {
  const { tools, mcpServers, closeTools } = await createTools()
  const names = tools.map(t => toolName(t))
  for (const banned of LOCAL_ONLY) expect(names).not.toContain(banned)
  expect(names).toContain("ask_user")
  expect(mcpServers).toEqual([])
  await closeTools()
})

test("includeLocalTools registers files and shell with their real implementations", async () => {
  const { tools, closeTools } = await createTools({ includeLocalTools: true })
  const byName = new Map(tools.map(t => [toolName(t), t]))
  for (const name of LOCAL_ONLY) expect(byName.has(name)).toBe(true)
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
