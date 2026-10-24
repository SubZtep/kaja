import { expect, test } from "bun:test"
import { providerKey, SecretsFileSchema } from "@kaja/schema/config"

test("empty file validates: every section is optional, providers/abilities default to {}", () => {
  const parsed = SecretsFileSchema.parse({})
  expect(parsed.telegram).toBeUndefined()
  expect(parsed.providers).toEqual({})
  expect(parsed.abilities).toEqual({})
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

test("abilities are keyed by ability name, each requiring api_key", () => {
  const parsed = SecretsFileSchema.parse({ abilities: { context7: { api_key: "ctx7sk-..." } } })
  expect(parsed.abilities).toEqual({ context7: { api_key: "ctx7sk-..." } })
  expect(() => SecretsFileSchema.parse({ abilities: { context7: {} } })).toThrow()
})

test("a provider's key can be named by its environment variable instead of saved", () => {
  const parsed = SecretsFileSchema.parse({ providers: { openai: { api_key_env: "OPENAI_API_KEY" } } })
  expect(providerKey(parsed.providers.openai, { OPENAI_API_KEY: "sk-env" })).toBe("sk-env")
  // Unset (or empty) reads as no key, for the doctor to report by name
  expect(providerKey(parsed.providers.openai, {})).toBeUndefined()
  expect(providerKey(parsed.providers.openai, { OPENAI_API_KEY: "" })).toBeUndefined()
  expect(providerKey({ api_key: "sk-saved" }, {})).toBe("sk-saved")
  expect(() => SecretsFileSchema.parse({ providers: { x: { api_key_env: "not a name" } } })).toThrow()
})
