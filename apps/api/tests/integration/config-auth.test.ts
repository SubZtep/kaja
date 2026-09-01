import { describe, expect, test } from "bun:test"
import { app } from "../../src/app"

const token = process.env.CONFIG_API_TOKEN

describe("config routes auth (fail-closed)", () => {
  test("CONFIG_API_TOKEN is set in test env", () => {
    // Preload loads apps/api/.env.example — fail-closed needs a real token.
    expect(token).toBeTruthy()
  })

  test("GET /config/models without Authorization is 401", async () => {
    const res = await app.request("/config/models")
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe("Unauthorized")
  })

  test("GET /config/models with wrong token is 401", async () => {
    const res = await app.request("/config/models", {
      headers: { Authorization: "Bearer wrong-token" }
    })
    expect(res.status).toBe(401)
  })

  test("GET /config/models.toml with valid token is not 401", async () => {
    const res = await app.request("/config/models.toml", {
      headers: { Authorization: `Bearer ${token}` }
    })
    // 200 with empty toml or 200 with content — never unauthorized when token matches
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })

  test("GET /config/mcp.toml with valid token is not 401", async () => {
    const res = await app.request("/config/mcp.toml", {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })

  test("GET /config/personas.toml with valid token is not 401", async () => {
    const res = await app.request("/config/personas.toml", {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(200)
  })
})
