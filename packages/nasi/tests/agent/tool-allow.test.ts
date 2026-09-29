import { expect, test } from "bun:test"
import { allowKey, isAllowed } from "../../src/agent/tool-allow"

test("a tool's allow key is its source and name, and a tool with no source has none", () => {
  const tool = (name: string, source?: string) => ({
    definition: { type: "function" as const, function: { name, parameters: {} } },
    execute: async () => "",
    source
  })
  expect(allowKey(tool("create_issue", "ability:github"))).toBe("ability:github:create_issue")
  expect(allowKey(tool("web_search"))).toBeUndefined()
})

test("patterns match exactly, or with * for any run of characters", () => {
  const key = "ability:github:create_issue"
  expect(isAllowed([key], key)).toBe(true)
  expect(isAllowed(["ability:github:create_*"], key)).toBe(true)
  expect(isAllowed(["ability:github:*"], key)).toBe(true)
  expect(isAllowed(["ability:github:create"], key)).toBe(false)
  expect(isAllowed(["ability:other:*"], key)).toBe(false)
  expect(isAllowed(["ability:github:create_issue.*"], "ability:github:create_issueX")).toBe(false)
  expect(isAllowed([], key)).toBe(false)
  expect(isAllowed(undefined, key)).toBe(false)
  expect(isAllowed([key], undefined)).toBe(false)
})
