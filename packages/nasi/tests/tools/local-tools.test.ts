import { expect, test } from "bun:test"
import { toolName } from "../../src/agent/tools"
import { createTools } from "../../src/tools/registry"

const LOCAL = ["run_command", "read_file", "list_files", "view_image"]

test("local tools are off by default", async () => {
  const { tools, mcpServers, closeTools } = await createTools()
  const names = tools.map(t => toolName(t))
  for (const banned of LOCAL) expect(names).not.toContain(banned)
  expect(names).toContain("ask_user")
  expect(mcpServers).toEqual([])
  await closeTools()
})

test("includeLocalTools registers files and shell", async () => {
  const { tools, closeTools } = await createTools({ includeLocalTools: true })
  const names = new Set(tools.map(t => toolName(t)))
  for (const name of LOCAL) expect(names.has(name)).toBe(true)
  expect(names.has("ask_user")).toBe(true)
  await closeTools()
})
