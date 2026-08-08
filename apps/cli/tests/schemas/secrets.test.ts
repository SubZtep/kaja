import { expect, test } from "bun:test"
import { SecretsFileSchema } from "@kaja/schema/config"

test("empty file validates: every section is optional, providers/mcp default to {}", () => {
  const parsed = SecretsFileSchema.parse({})
  expect(parsed.api).toBeUndefined()
  expect(parsed.location).toBeUndefined()
  expect(parsed.webSearch).toBeUndefined()
  expect(parsed.telegram).toBeUndefined()
  expect(parsed.zen).toBeUndefined()
  expect(parsed.providers).toEqual({})
  expect(parsed.mcp).toEqual({})
})

test("api group requires a non-empty token", () => {
  const parsed = SecretsFileSchema.parse({ api: { token: "shared-secret" } })
  expect(parsed.api).toEqual({ token: "shared-secret" })
  expect(() => SecretsFileSchema.parse({ api: { token: "" } })).toThrow()
})

test("location group requires apiKey", () => {
  const parsed = SecretsFileSchema.parse({ location: { apiKey: "key" } })
  expect(parsed.location).toEqual({ apiKey: "key" })
  expect(() => SecretsFileSchema.parse({ location: {} })).toThrow()
})

test("webSearch group requires apiKey", () => {
  const parsed = SecretsFileSchema.parse({ webSearch: { apiKey: "key" } })
  expect(parsed.webSearch).toEqual({ apiKey: "key" })
  expect(() => SecretsFileSchema.parse({ webSearch: {} })).toThrow()
})

test("telegram group requires botToken", () => {
  const parsed = SecretsFileSchema.parse({ telegram: { botToken: "123:abc" } })
  expect(parsed.telegram).toEqual({ botToken: "123:abc" })
  expect(() => SecretsFileSchema.parse({ telegram: {} })).toThrow()
})

test("zen group requires apiKey", () => {
  const parsed = SecretsFileSchema.parse({ zen: { apiKey: "sk-zen" } })
  expect(parsed.zen).toEqual({ apiKey: "sk-zen" })
  expect(() => SecretsFileSchema.parse({ zen: {} })).toThrow()
})

test("providers is keyed by provider name, each requiring api_key", () => {
  const parsed = SecretsFileSchema.parse({ providers: { fireworks: { api_key: "fw_..." } } })
  expect(parsed.providers).toEqual({ fireworks: { api_key: "fw_..." } })
  expect(() => SecretsFileSchema.parse({ providers: { fireworks: {} } })).toThrow()
})

test("mcp is keyed by server id, each an arbitrary string record", () => {
  const parsed = SecretsFileSchema.parse({ mcp: { context7: { CONTEXT7_API_KEY: "ctx7sk-..." } } })
  expect(parsed.mcp).toEqual({ context7: { CONTEXT7_API_KEY: "ctx7sk-..." } })
})
