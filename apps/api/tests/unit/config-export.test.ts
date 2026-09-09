import { describe, expect, test } from "bun:test"
import type { McpServer, Model, Persona, Provider } from "@kaja/schema/api"
import { PersonaSchema } from "@kaja/schema/cli"
import { McpFileSchema, ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { renderMcpToml, renderModelsToml, renderPersonaToml } from "../../src/services/config-export"

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "provider-1",
    name: "fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKey: "sk-super-secret",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

function makeMcpServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "mcp-1",
    serverId: "context7",
    command: null,
    args: [],
    env: {},
    url: "https://mcp.example.com",
    headers: { Authorization: "Bearer sk-secret-token", "X-Region": "eu" },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }
}

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: "persona-1",
    personaId: "care",
    label: "Care assistant",
    when: "the user talks about their day",
    instructions: "Be warm and grounded.",
    dataset: null,
    models: {},
    sampling: { temperature: 0.3 },
    enabled: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
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

describe("renderMcpToml", () => {
  test("strips header/env keys that aren't on the safe allowlist", () => {
    const toml = renderMcpToml([makeMcpServer()])
    expect(toml).not.toContain("sk-secret-token")
    expect(toml).not.toContain("Authorization")
    // Not obviously secret-shaped, but nobody vetted it either — the allowlist drops it.
    expect(toml).not.toContain("X-Region")
  })

  test("keeps allowlisted keys", () => {
    const toml = renderMcpToml([makeMcpServer({ headers: { "Content-Type": "application/json" } })])
    expect(toml).toContain("Content-Type")
  })

  test("drops credentials a secret-shaped denylist would have missed", () => {
    const toml = renderMcpToml([
      makeMcpServer({ headers: { "X-Api": "sk-leaky", BRAVE_ID: "id-leaky", CLIENT_ID: "client-leaky" } })
    ])
    expect(toml).not.toContain("sk-leaky")
    expect(toml).not.toContain("id-leaky")
    expect(toml).not.toContain("client-leaky")
  })

  test("round-trips through McpFileSchema", () => {
    const toml = renderMcpToml([makeMcpServer()])
    const parsed = McpFileSchema.safeParse(TOML.parse(toml))
    expect(parsed.success).toBeTrue()
  })

  test("omits disabled servers", () => {
    const toml = renderMcpToml([makeMcpServer({ enabled: false })])
    const parsed = TOML.parse(toml) as { servers: unknown[] }
    expect(parsed.servers).toHaveLength(0)
  })
})

describe("renderPersonaToml", () => {
  test("round-trips through PersonaSchema", () => {
    const toml = renderPersonaToml(makePersona())
    const parsed = PersonaSchema.safeParse(TOML.parse(toml))
    expect(parsed.success).toBeTrue()
  })
})
