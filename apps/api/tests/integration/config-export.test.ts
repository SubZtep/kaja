import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { mcpServerService, personaService } from "../../src/services"
import { cleanupModel, seedModel } from "./helpers"

describe("config export", () => {
  let providerId: string
  let mcpServerId: string
  let personaRowId: string
  const personaId = `export-test-${faker.string.alphanumeric(8)}`

  beforeAll(async () => {
    ;({ providerId } = await seedModel("export-test"))
    const mcpServer = await mcpServerService.create({
      serverId: `export-test-${faker.string.alphanumeric(8)}`,
      url: "https://mcp.example.com/export-test",
      headers: { Authorization: "Bearer sk-super-secret-token" },
      args: [],
      env: {},
      enabled: true
    })
    mcpServerId = mcpServer.id

    const persona = await personaService.create({
      personaId,
      label: "Export test persona",
      instructions: "Say hi.",
      enabled: true,
      sortOrder: 0
    })
    personaRowId = persona.id
  })

  afterAll(async () => {
    await cleanupModel(providerId)
    await pool.query("DELETE FROM mcp_server WHERE id = $1", [mcpServerId])
    await pool.query("DELETE FROM persona WHERE id = $1", [personaRowId])
  })

  test("GET /config/export requires no auth and returns a TOML bundle", async () => {
    const res = await app.request("/config/export")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.files["models.toml"]).toContain("provider")
    expect(body.files["mcp.toml"]).toContain("export-test")
    expect(body.files[`personas/${personaId}.toml`]).toContain("Export test persona")
  })

  test("strips secret-shaped header values", async () => {
    const res = await app.request("/config/export")
    const body = await res.json()
    expect(body.files["mcp.toml"]).not.toContain("sk-super-secret-token")
    expect(body.files["mcp.toml"]).not.toContain("Authorization")
  })

  test("never emits provider api_key", async () => {
    const res = await app.request("/config/export")
    const body = await res.json()
    expect(body.files["models.toml"]).not.toContain("api_key")
  })

  test("honours If-None-Match with a 304", async () => {
    const first = await app.request("/config/export")
    const etag = first.headers.get("etag")
    expect(etag).not.toBeNull()

    const second = await app.request("/config/export", { headers: { "If-None-Match": etag! } })
    expect(second.status).toBe(304)
  })

  test("GET /config/export/models.toml returns plain text", async () => {
    const res = await app.request("/config/export/models.toml")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    const text = await res.text()
    expect(text).toContain("provider")
  })

  test("GET /config/export/personas/<id>.toml returns that persona", async () => {
    const res = await app.request(`/config/export/personas/${personaId}.toml`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("Export test persona")
  })

  test("GET /config/export/<unknown> returns 404", async () => {
    const res = await app.request("/config/export/does-not-exist.toml")
    expect(res.status).toBe(404)
  })
})
