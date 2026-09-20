import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { mcpServerService } from "../../src/services"
import { cleanupModel, seedModel } from "./helpers"

describe("config export", () => {
  let providerId: string
  let mcpServerId: string

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
  })

  afterAll(async () => {
    await cleanupModel(providerId)
    await pool.query("DELETE FROM mcp_server WHERE id = $1", [mcpServerId])
  })

  test("GET /config/export requires no auth and returns a TOML bundle", async () => {
    const res = await app.request("/config/export")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.files["models.toml"]).toContain("provider")
    expect(body.files["mcp.toml"]).toContain("export-test")
    // Personas are marketplace abilities; `kaja abilities update` brings them, not the export.
    expect(Object.keys(body.files).sort()).toEqual(["mcp.toml", "models.toml"])
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

  test("GET /config/export/personas/<id>.toml is gone", async () => {
    // Unmatched, it falls through to the signed-in /config routes; either way no persona is served.
    expect((await app.request("/config/export/personas/default.toml")).status).not.toBe(200)
  })

  test("GET /config/export/<unknown> returns 404", async () => {
    const res = await app.request("/config/export/does-not-exist.toml")
    expect(res.status).toBe(404)
  })
})
