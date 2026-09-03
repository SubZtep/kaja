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
})
