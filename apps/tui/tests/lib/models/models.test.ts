import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-models`

const { setConfigDirOverride } = await import("../../../lib/config/config")
const { loadModelsFile, resolveActiveModel, findModelById, resolveModels, getModelsPath } = await import(
  "../../../lib/models/models"
)
const { invalidateSecretsCache } = await import("../../../lib/config/secrets")
type ResolvedModelsFile = Awaited<ReturnType<typeof loadModelsFile>>

const DATA: ResolvedModelsFile = {
  providers: {
    default: { base_url: "https://api.example.test/v1", api_key: "test-key" },
    speaches: { base_url: "http://localhost:8000" }
  },
  tasks: { chat: "chat", stt: "faster-whisper" },
  models: {
    chat: { model: "accounts/example/models/chat", tasks: ["chat"], provider: "default" },
    "reasoning-chat": { model: "accounts/example/models/reasoning", tasks: ["chat", "summarize"], provider: "default" },
    "faster-whisper": { model: "Systran/faster-whisper", tasks: ["stt"], provider: "speaches" }
  }
}

test("resolveModels flattens each models.toml entry with its provider's credentials, once per task", () => {
  expect(resolveModels(DATA)).toEqual([
    {
      id: "chat",
      model: "accounts/example/models/chat",
      task: "chat",
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-key",
      provider: "default"
    },
    {
      id: "reasoning-chat",
      model: "accounts/example/models/reasoning",
      task: "chat",
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-key",
      provider: "default"
    },
    {
      id: "reasoning-chat",
      model: "accounts/example/models/reasoning",
      task: "summarize",
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-key",
      provider: "default"
    },
    {
      id: "faster-whisper",
      model: "Systran/faster-whisper",
      task: "stt",
      baseUrl: "http://localhost:8000",
      apiKey: undefined,
      provider: "speaches"
    }
  ])
})

test("findModelById looks up by id, optionally constrained to a task", () => {
  expect(findModelById(resolveModels(DATA), "chat")?.model).toBe("accounts/example/models/chat")
  expect(findModelById(resolveModels(DATA), "chat", "chat")?.model).toBe("accounts/example/models/chat")
  expect(findModelById(resolveModels(DATA), "chat", "embedding")).toBeUndefined()
  expect(findModelById(resolveModels(DATA), undefined)).toBeUndefined()
  expect(findModelById(resolveModels(DATA), "nope")).toBeUndefined()
})

test("resolveActiveModel with no personaModels uses the model [tasks] names", () => {
  expect(resolveActiveModel(DATA, "chat")?.id).toBe("chat")
  expect(resolveActiveModel(DATA, "stt")?.id).toBe("faster-whisper")
  expect(resolveActiveModel(DATA, "embedding")).toBeUndefined()
  // A model can serve a task [tasks] leaves out: it's there to pin, but nothing uses it.
  expect(resolveActiveModel(DATA, "summarize")).toBeUndefined()
})

test("resolveActiveModel: a persona's pin for a task wins over the model [tasks] names", () => {
  const resolved = resolveActiveModel(DATA, "chat", { chat: "reasoning-chat" })
  expect(resolved?.id).toBe("reasoning-chat")
})

test("resolveActiveModel: an absent persona pin for a task falls back to the model [tasks] names", () => {
  const resolved = resolveActiveModel(DATA, "chat", { embedding: "reasoning-chat" })
  expect(resolved?.id).toBe("chat")
})

test("resolveActiveModel: a persona pin naming an unknown id soft-falls-back to the [models.<task>] entry", () => {
  const resolved = resolveActiveModel(DATA, "chat", { chat: "does-not-exist" })
  expect(resolved?.id).toBe("chat")
})

test("resolveActiveModel: a persona pin whose task doesn't match soft-falls-back to the [models.<task>] entry", () => {
  // "faster-whisper" exists but serves stt, not chat.
  const resolved = resolveActiveModel(DATA, "chat", { chat: "faster-whisper" })
  expect(resolved?.id).toBe("chat")
})

// Other test files sharing this bun test process may have already cached secrets() with their
// own fixtures — invalidate before every test, not just after.
beforeEach(() => {
  invalidateSecretsCache()
})

afterEach(() => {
  setConfigDirOverride(undefined)
  invalidateSecretsCache()
})

test("no models.toml file: loads no models without writing one", async () => {
  const dir = `${tmpdir()}/kaja-test-models-no-file-${Math.random()}`
  setConfigDirOverride(dir)

  const data = await loadModelsFile()
  expect(data).toEqual({ providers: {}, tasks: {}, models: {} })
  expect(await Bun.file(getModelsPath()).exists()).toBe(false)
})

test("loadModelsFile folds secrets.toml's [providers.<name>].api_key into the matching provider", async () => {
  const dir = `${tmpdir()}/kaja-test-models-secrets-merge-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "models.toml"),
    `
[providers.fireworks]
base_url = "https://api.fireworks.ai/inference/v1"

[models.fast-chat]
model = "some/chat-model"
tasks = ["chat"]
provider = "fireworks"
`
  )
  await write(
    join(dir, "secrets.toml"),
    `
[providers.fireworks]
api_key = "fw-secret"
`
  )

  const data = await loadModelsFile()
  expect(data.providers.fireworks?.api_key).toBe("fw-secret")
})

test("loadModelsFile leaves api_key undefined for a provider with no matching secrets.toml entry", async () => {
  const dir = `${tmpdir()}/kaja-test-models-secrets-missing-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "models.toml"),
    `
[providers.fireworks]
base_url = "https://api.fireworks.ai/inference/v1"

[models.fast-chat]
model = "some/chat-model"
tasks = ["chat"]
provider = "fireworks"
`
  )
  await write(join(dir, "secrets.toml"), "")

  const data = await loadModelsFile()
  expect(data.providers.fireworks?.api_key).toBeUndefined()
})

test("loadModelsFile ignores a secrets.toml provider entry that names no provider in models.toml", async () => {
  const dir = `${tmpdir()}/kaja-test-models-secrets-unmatched-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "models.toml"),
    `
[providers.fireworks]
base_url = "https://api.fireworks.ai/inference/v1"

[models.fast-chat]
model = "some/chat-model"
tasks = ["chat"]
provider = "fireworks"
`
  )
  await write(
    join(dir, "secrets.toml"),
    `
[providers.nonexistent]
api_key = "orphaned-secret"
`
  )

  const data = await loadModelsFile()
  expect(Object.keys(data.providers)).toEqual(["fireworks"])
  expect(data.providers.fireworks?.api_key).toBeUndefined()
})
