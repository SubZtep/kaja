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

[models.chat]
model = "accounts/fireworks/models/deepseek"
tasks = ["chat"]
provider = "fireworks"

[models.tts]
model = "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16"
tasks = ["tts"]
provider = "speaches"
`

test("valid file parses and resolves provider baseUrl (credentials come from secrets.toml, folded in by loadModelsFile)", () => {
  const models = resolveModels(parse(VALID))
  expect(models).toEqual([
    {
      id: "chat",
      model: "accounts/fireworks/models/deepseek",
      task: "chat",
      baseUrl: "https://api.fireworks.ai/inference/v1",
      apiKey: undefined,
      provider: "fireworks"
    },
    {
      id: "tts",
      model: "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16",
      task: "tts",
      baseUrl: "http://localhost:8000",
      apiKey: undefined,
      provider: "speaches"
    }
  ])
})

test("empty file parses to no providers, no models", () => {
  expect(parse("")).toEqual({ providers: {}, models: {} })
})

test("unknown provider reference is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.some-chat]
model = "some/model"
tasks = ["chat"]
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
tasks = ["chat"]
`
  expect(() => parse(toml)).toThrow()
})

test("a duplicate model id is a TOML parse error, not a schema issue (map keys can't repeat)", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.dup]
model = "some/model"
tasks = ["chat"]
provider = "fireworks"

[models.dup]
model = "other/model"
tasks = ["embedding"]
provider = "fireworks"
`
  expect(() => TOML.parse(toml)).toThrow()
})

test("unknown task is rejected", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.some-chat]
model = "some/model"
tasks = ["juggling"]
provider = "fireworks"
`
  expect(() => parse(toml)).toThrow()
})

test("models keep their file order, which picks each task's model", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.zeta]
model = "some/zeta"
provider = "fireworks"
tasks = ["chat"]

[models.alpha]
model = "some/alpha"
provider = "fireworks"
tasks = ["chat"]
`
  expect(Object.keys(parse(toml).models)).toEqual(["zeta", "alpha"])
})

test("a numeric model id is rejected, since it would jump to the front", () => {
  const toml = `
[providers.fireworks]
base_url = "https://api.example.test/v1"

[models.42]
model = "some/model"
provider = "fireworks"
tasks = ["chat"]
`
  expect(() => parse(toml)).toThrow("non-numeric id")
})
