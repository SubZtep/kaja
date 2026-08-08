import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { write } from "bun"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-models`

const { setConfigDirOverride, getConfigPath } = await import("../../../lib/config/config")
const { loadModelsFile, resolveModelFromConfig, resolveModels, getModelsPath } = await import(
  "../../../lib/models/models"
)
const { invalidateSecretsCache } = await import("../../../lib/config/secrets")
type ResolvedModelsFile = Awaited<ReturnType<typeof loadModelsFile>>

const DATA: ResolvedModelsFile = {
  providers: {
    default: { base_url: "https://api.example.test/v1", api_key: "test-key", default: true },
    speaches: { base_url: "http://localhost:8000" }
  },
  models: [
    { model: "accounts/example/models/chat", task: "chat" },
    { model: "Systran/faster-whisper", task: "speech-to-text", provider: "speaches" }
  ]
}

test("resolves a settings.toml {model, provider} ref against its provider's credentials", () => {
  expect(resolveModelFromConfig(DATA, { model: "accounts/example/models/chat", provider: "default" }, "chat")).toEqual({
    model: "accounts/example/models/chat",
    task: "chat",
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    provider: "default"
  })
})

test("resolves a ref on a named provider", () => {
  expect(
    resolveModelFromConfig(DATA, { model: "Systran/faster-whisper", provider: "speaches" }, "speech-to-text")
  ).toEqual({
    model: "Systran/faster-whisper",
    task: "speech-to-text",
    baseUrl: "http://localhost:8000",
    apiKey: undefined,
    provider: "speaches"
  })
})

test("ref with no provider resolves to undefined (free-tier fallback case)", () => {
  expect(resolveModelFromConfig(DATA, { model: "anything" }, "chat")).toBeUndefined()
})

test("ref naming an unknown provider throws", () => {
  expect(() => resolveModelFromConfig(DATA, { model: "anything", provider: "nope" }, "chat")).toThrow()
})

test("resolveModels flattens each entry with its provider's credentials", () => {
  expect(resolveModels(DATA)).toEqual([
    {
      model: "accounts/example/models/chat",
      task: "chat",
      baseUrl: "https://api.example.test/v1",
      apiKey: "test-key",
      provider: "default"
    },
    {
      model: "Systran/faster-whisper",
      task: "speech-to-text",
      baseUrl: "http://localhost:8000",
      apiKey: undefined,
      provider: "speaches"
    }
  ])
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

test("free hosted chat with no other task configured: loads an empty file without writing models.toml", async () => {
  const dir = `${tmpdir()}/kaja-test-models-free-only-${Math.random()}`
  setConfigDirOverride(dir)
  await write(getConfigPath(), "[models]\n")

  const data = await loadModelsFile()
  expect(data).toEqual({ providers: {}, models: [] })
  expect(await Bun.file(getModelsPath()).exists()).toBe(false)
})

test("free hosted chat plus another configured task: still writes the example template", async () => {
  const dir = `${tmpdir()}/kaja-test-models-free-plus-task-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    getConfigPath(),
    `
[models.embedding]
model = "embedding-default"
provider = "default"
`
  )

  await loadModelsFile()
  expect(await Bun.file(getModelsPath()).exists()).toBe(true)
})

test("loadModelsFile folds secrets.toml's [providers.<name>].api_key into the matching provider", async () => {
  const dir = `${tmpdir()}/kaja-test-models-secrets-merge-${Math.random()}`
  setConfigDirOverride(dir)
  await write(
    join(dir, "models.toml"),
    `
[providers.fireworks]
default = true
base_url = "https://api.fireworks.ai/inference/v1"

[[models]]
model = "some/chat-model"
task = "chat"
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
default = true
base_url = "https://api.fireworks.ai/inference/v1"

[[models]]
model = "some/chat-model"
task = "chat"
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
default = true
base_url = "https://api.fireworks.ai/inference/v1"

[[models]]
model = "some/chat-model"
task = "chat"
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
