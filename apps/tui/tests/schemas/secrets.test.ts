import { expect, test } from "bun:test"
import { SecretsFileSchema } from "@kaja/schema/config"

test("empty file validates: every section is optional, providers/mcp default to {}", () => {
  const parsed = SecretsFileSchema.parse({})
  expect(parsed.telegram).toBeUndefined()
  expect(parsed.providers).toEqual({})
  expect(parsed.mcp).toEqual({})
})

test("telegram group requires bot_token, and owner_ids defaults to none", () => {
  const parsed = SecretsFileSchema.parse({ telegram: { bot_token: "123:abc" } })
  expect(parsed.telegram).toEqual({ bot_token: "123:abc", owner_ids: [] })
  expect(() => SecretsFileSchema.parse({ telegram: {} })).toThrow()
  expect(() => SecretsFileSchema.parse({ telegram: { bot_token: "123:abc", owner_ids: [1.5] } })).toThrow()
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
