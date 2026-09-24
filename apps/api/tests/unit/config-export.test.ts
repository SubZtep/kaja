import { describe, expect, test } from "bun:test"
import type { Model, Provider } from "@kaja/schema/api"
import { ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { renderModelsToml } from "../../src/services/config-export"

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "provider-1",
    name: "fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    hasApiKey: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    id: "model-1",
    providerId: "provider-1",
    model: "accounts/fireworks/models/minimax-m3",
    tasks: ["chat"],
    enabled: true,
    free: true,
    contextWindow: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: null,
    ...overrides
  }
}

describe("renderModelsToml", () => {
  test("never emits provider.api_key", () => {
    const toml = renderModelsToml([makeProvider()], [makeModel()])
    expect(toml).not.toContain("sk-super-secret")
    expect(toml).not.toContain("api_key")
  })

  test("round-trips through ModelsFileSchema", () => {
    const toml = renderModelsToml([makeProvider()], [makeModel()])
    const parsed = ModelsFileSchema.safeParse(TOML.parse(toml))
    expect(parsed.success).toBeTrue()
  })

  test("keys each model by its name's slug and names it in [tasks] for the tasks it wins", () => {
    const chat = makeModel({ id: "m1", model: "accounts/fireworks/models/minimax-m3", tasks: ["chat", "summarize"] })
    const second = makeModel({ id: "m2", model: "other/chat-model", tasks: ["chat", "embedding"] })
    const parsed = ModelsFileSchema.parse(TOML.parse(renderModelsToml([makeProvider()], [chat, second])))
    expect(parsed.tasks).toEqual({ chat: "minimax-m3", summarize: "minimax-m3", embedding: "chat-model" })
    expect(parsed.models["minimax-m3"]?.tasks).toEqual(["chat", "summarize"])
    // The second model lost chat to the first, so it only lists the task it serves in [tasks].
    expect(parsed.models["chat-model"]?.tasks).toEqual(["embedding"])
  })

  test("omits models from disabled providers or disabled models", () => {
    const toml = renderModelsToml([makeProvider()], [makeModel({ enabled: false })])
    const parsed = TOML.parse(toml) as { models: Record<string, unknown> }
    expect(Object.keys(parsed.models)).toHaveLength(0)
  })

  test("omits paid models — the export endpoint is public", () => {
    const toml = renderModelsToml([makeProvider()], [makeModel({ free: false })])
    const parsed = TOML.parse(toml) as { models: Record<string, unknown> }
    expect(Object.keys(parsed.models)).toHaveLength(0)
  })

  test("omits providers no exported model references", () => {
    const toml = renderModelsToml([makeProvider()], [makeModel({ free: false })])
    const parsed = TOML.parse(toml) as { providers: Record<string, unknown> }
    expect(Object.keys(parsed.providers)).toHaveLength(0)
  })
})
