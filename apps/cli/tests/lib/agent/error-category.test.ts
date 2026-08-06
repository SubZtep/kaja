import { expect, test } from "bun:test"
import { APIConnectionError } from "openai"
import { categorizeError } from "../../../lib/agent/error-category"

// lib/agent/agents.ts (imported below, only for the ToolError class) pulls in lib/models/openai.ts, which calls config() at module scope — so this file needs its own isolated, populated config dir regardless of what other test files leave XDG_CONFIG_HOME pointing at when this module first loads.
process.env.XDG_CONFIG_HOME = `${import.meta.dir}/../../.tmp-test-xdg-config-error-category`
const { saveConfig } = await import("../../../lib/config/config")
const { getModelsPath } = await import("../../../lib/models/models")
await saveConfig({ models: { chat: { model: "test-model", provider: "default" } } })
await Bun.write(
  getModelsPath(),
  `
[providers.default]
default = true
base_url = "http://localhost/v1"
api_key = "llm-key"

[[models]]
id = "chat-default"
model = "test-model"
task = "chat"
`
)

const { ToolError } = await import("../../../lib/agent/agents")

test("categorizes an OpenAI API error as network, prefixed with LLM API", () => {
  const error = new APIConnectionError({ message: "connection refused" })
  expect(categorizeError(error)).toEqual({
    category: "network",
    message: "LLM API: connection refused"
  })
})

test("categorizes a ToolError as tool, prefixed with the tool name", () => {
  const error = new ToolError("fetch_url", "Fetch failed: 404")
  expect(categorizeError(error)).toEqual({
    category: "tool",
    message: "fetch_url: Fetch failed: 404"
  })
})

test("categorizes a plain Error as agent", () => {
  const error = new Error("Unknown tool: foo")
  expect(categorizeError(error)).toEqual({
    category: "agent",
    message: "Unknown tool: foo"
  })
})

test("categorizes a non-Error throw as unknown", () => {
  expect(categorizeError("boom")).toEqual({
    category: "unknown",
    message: "boom"
  })
})
