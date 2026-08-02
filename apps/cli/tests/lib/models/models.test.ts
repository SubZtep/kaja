import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { write } from "bun"
import type { KajaModelsFile } from "../../../schemas/models"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-models`

const { setConfigDirOverride, getConfigPath } = await import("../../../lib/config/config")
const { loadModelsFile, resolveModelById, getModelsPath } = await import("../../../lib/models/models")

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

afterEach(() => {
  setConfigDirOverride(undefined)
})

test("free hosted chat with no other task configured: loads an empty file without writing models.toml", async () => {
  const dir = `${tmpdir()}/kaja-test-models-free-only-${Math.random()}`
  setConfigDirOverride(dir)
  await write(getConfigPath(), JSON.stringify({ models: { chat: "kaja-free-chat" } }))

  const data = await loadModelsFile()
  expect(data).toEqual({ providers: {}, models: [] })
  expect(await Bun.file(getModelsPath()).exists()).toBe(false)
})

test("free hosted chat plus another configured task: still writes the example template", async () => {
  const dir = `${tmpdir()}/kaja-test-models-free-plus-task-${Math.random()}`
  setConfigDirOverride(dir)
  await write(getConfigPath(), JSON.stringify({ models: { chat: "kaja-free-chat", embedding: "embedding-default" } }))

  await loadModelsFile()
  expect(await Bun.file(getModelsPath()).exists()).toBe(true)
})
