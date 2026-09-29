import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { ModelUnavailableError, NoModelError } from "@kaja/nasi"
import { app } from "../../src/app"
import { setNasiChatResolver } from "../../src/features/nasi/chat"
import { statsService } from "../../src/services"
import { signUpAndSignIn } from "./helpers"

describe("error responses", () => {
  const email = faker.internet.email()
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string
  const post = (path: string) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "hi" })
    })

  beforeAll(async () => {
    token = await signUpAndSignIn(email, password, "Errors Tester")
  })

  afterAll(() => {
    setNasiChatResolver(undefined)
  })

  test("an unknown path answers JSON", async () => {
    const res = await app.request("/no-such-route")
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Not found" })
  })

  test("a body over 1 MB is refused before any route reads it", async () => {
    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "x".repeat(1024 * 1024) })
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: "Request body too large" })
  })

  test("no model to run a turn with is 503, in the buffered and the streamed turn", async () => {
    setNasiChatResolver(() => Promise.reject(new NoModelError()))
    const res = await post("/nasi/turn")
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "No model available" })

    const stream = await (await post("/nasi/turn/stream")).text()
    expect(stream).toContain("event: error")
    expect(stream).toContain("No model available")
  })

  test("a failing model provider is 502 with its message", async () => {
    setNasiChatResolver(() =>
      Promise.reject(new ModelUnavailableError("upstream said no", { contextOverflow: false, cause: undefined }))
    )
    const res = await post("/nasi/turn")
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "Model provider request failed: upstream said no" })
  })

  test("a crash no route catches still answers JSON, and is logged", async () => {
    const usage = spyOn(statsService, "usage").mockRejectedValue(new Error("database down"))
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const res = await app.request("/stats", { headers: { Authorization: `Bearer ${token}` } })
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: "Internal server error" })
      expect(logged).toHaveBeenCalledWith("Unhandled API error", expect.objectContaining({ path: "/stats" }))
    } finally {
      usage.mockRestore()
      logged.mockRestore()
    }
  })
})
