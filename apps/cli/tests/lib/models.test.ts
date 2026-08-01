import { expect, test } from "bun:test"
import { resolveModelById } from "../../lib/models"
import type { KajaModelsFile } from "../../schemas/models"

const DATA: KajaModelsFile = {
  providers: {
    default: { base_url: "https://api.example.test/v1", api_key: "test-key" },
    speaches: { base_url: "http://localhost:8000" }
  },
  models: [
    { id: "chat-default", model: "accounts/example/models/chat", task: "chat" },
    { id: "stt-default", model: "Systran/faster-whisper", task: "speech-to-text", provider: "speaches" }
  ]
}

test("resolves a model by its models.toml id, with its provider's credentials", () => {
  expect(resolveModelById(DATA, "chat-default")).toEqual({
    id: "accounts/example/models/chat",
    task: "chat",
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key"
  })
})

test("resolves a model on a named provider", () => {
  expect(resolveModelById(DATA, "stt-default")).toEqual({
    id: "Systran/faster-whisper",
    task: "speech-to-text",
    baseUrl: "http://localhost:8000",
    apiKey: undefined
  })
})

test("unknown id resolves to undefined", () => {
  expect(resolveModelById(DATA, "nope")).toBeUndefined()
})
