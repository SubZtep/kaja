import { expect, test } from "bun:test"
import { ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { resolveModels } from "../../lib/models/models"

const parse = (toml: string) => ModelsFileSchema.parse(TOML.parse(toml))

const VALID = `
[providers.fireworks]
default = true
base_url = "https://api.fireworks.ai/inference/v1"
api_key = "fw-test"

[providers.speaches]
base_url = "http://localhost:8000"

[[models]]
model = "accounts/fireworks/models/deepseek"
task = "chat"

[[models]]
model = "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16"
task = "text-to-speech"
provider = "speaches"
`

test("valid file parses and resolves provider credentials", () => {
  const models = resolveModels(parse(VALID))
  expect(models).toEqual([
    {
      model: "accounts/fireworks/models/deepseek",
      task: "chat",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      apiKey: "fw-test",
      provider: "fireworks"
    },
    {
      model: "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16",
      task: "text-to-speech",
      baseUrl: "http://localhost:8000",
      apiKey: undefined,
      provider: "speaches"
    }
  ])
})

test("empty file parses to no providers and no models", () => {
  expect(parse("")).toEqual({ providers: {}, models: [] })
})

test("unknown provider reference is rejected", () => {
  const toml = `
[providers.fireworks]
default = true
base_url = "https://api.example.test/v1"

[[models]]
model = "some/model"
task = "chat"
provider = "nope"
`
  expect(() => parse(toml)).toThrow("Unknown provider")
})

test("model without provider requires a provider with default = true", () => {
  const toml = `
[providers.speaches]
base_url = "http://localhost:8000"

[[models]]
model = "some/model"
task = "chat"
`
  expect(() => parse(toml)).toThrow("no [providers.*] table has default = true")
})

test("model without provider resolves to the default = true provider", () => {
  const toml = `
[providers.speaches]
base_url = "http://localhost:8000"

[providers.fireworks]
default = true
base_url = "https://api.example.test/v1"
api_key = "fw-test"

[[models]]
model = "some/model"
task = "chat"
`
  const models = resolveModels(parse(toml))
  expect(models).toEqual([
    {
      model: "some/model",
      task: "chat",
      baseUrl: "https://api.example.test/v1",
      apiKey: "fw-test",
      provider: "fireworks"
    }
  ])
})

test("unknown task is rejected", () => {
  const toml = `
[providers.fireworks]
default = true
base_url = "https://api.example.test/v1"

[[models]]
model = "some/model"
task = "juggling"
`
  expect(() => parse(toml)).toThrow()
})
