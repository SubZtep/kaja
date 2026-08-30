import { expect, test } from "bun:test"
import { ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { resolveModels } from "../../lib/models/models"

const parse = (toml: string) => ModelsFileSchema.parse(TOML.parse(toml))

const VALID = `
[providers.fireworks]
base_url = "https://api.fireworks.ai/inference/v1"

[providers.speaches]
base_url = "http://localhost:8000"

[models.fast-chat]
model = "accounts/fireworks/models/deepseek"
task = "chat"
provider = "fireworks"

[models.default-tts]
model = "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16"
task = "text-to-speech"
provider = "speaches"

[active]
chat = "fast-chat"
`

test("valid file parses and resolves provider baseUrl (credentials come from secrets.toml, folded in by loadModelsFile)", () => {
  const models = resolveModels(parse(VALID))
  expect(models).toEqual([
    {
      id: "fast-chat",
      model: "accounts/fireworks/models/deepseek",
      task: "chat",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      apiKey: undefined,
      provider: "fireworks"
    },
    {
      id: "default-tts",
      model: "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16",
      task: "text-to-speech",
      baseUrl: "http://localhost:8000",
      apiKey: undefined,
      provider: "speaches"
    }
  ])
})

test("empty file parses to no providers, no models, no active picks", () => {
  expect(parse("")).toEqual({ providers: {}, models: {}, active: {} })
})

test("unknown provider reference is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.some-chat]
model = "some/model"
task = "chat"
provider = "nope"
`
  expect(() => parse(toml)).toThrow("Unknown provider")
})

test("model entry without a provider is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.some-chat]
model = "some/model"
task = "chat"
`
  expect(() => parse(toml)).toThrow()
})

test("a duplicate model id is a TOML parse error, not a schema issue (map keys can't repeat)", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.dup]
model = "some/model"
task = "chat"
provider = "fireworks"

[models.dup]
model = "other/model"
task = "embedding"
provider = "fireworks"
`
  expect(() => TOML.parse(toml)).toThrow()
})

test("active.<task> naming an unknown model id is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.fast-chat]
model = "some/model"
task = "chat"
provider = "fireworks"

[active]
chat = "nope"
`
  expect(() => parse(toml)).toThrow("unknown model id")
})

test("active.<task> naming an id whose task doesn't match is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.fast-chat]
model = "some/model"
task = "chat"
provider = "fireworks"

[active]
embedding = "fast-chat"
`
  expect(() => parse(toml)).toThrow("whose task is")
})

test("valid active round-trips", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.fast-chat]
model = "some/model"
task = "chat"
provider = "fireworks"

[active]
chat = "fast-chat"
`
  expect(parse(toml).active).toEqual({ chat: "fast-chat" })
})

test("unknown task is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.some-chat]
model = "some/model"
task = "juggling"
provider = "fireworks"
`
  expect(() => parse(toml)).toThrow()
})
