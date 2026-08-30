import { expect, test } from "bun:test"
import { toolName } from "../../src/agent/tools"
import { createTools, HOSTED_SAFE, LOCAL_ONLY } from "../../src/tools/registry"

test("hosted profile never includes local-only tools", async () => {
  const { tools, closeTools } = await createTools({ profile: "hosted" })
  const names = tools.map(t => toolName(t))
  expect(names).not.toContain("run_command")
  expect(names).not.toContain("read_file")
  expect(names).not.toContain("list_files")
  expect(names).not.toContain("view_image")
  for (const name of names) expect(HOSTED_SAFE.has(name)).toBe(true)
  for (const banned of LOCAL_ONLY) expect(names).not.toContain(banned)
  await closeTools()
})

test("hosted profile includes ask_user", async () => {
  const { tools, closeTools } = await createTools({ profile: "hosted" })
  expect(tools.map(t => toolName(t))).toContain("ask_user")
  await closeTools()
})
