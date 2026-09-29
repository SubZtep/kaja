import { beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { env } from "../../src/core/env"
import { signUpAndSignIn } from "./helpers"

const attacker = "https://attacker.test"

describe("cross-site protection", () => {
  const email = faker.internet.email()
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string
  let cookie: string

  beforeAll(async () => {
    token = await signUpAndSignIn(email, password, "CSRF Tester")
    // A second sign-in for the browser-style session cookie the web app would carry
    const signIn = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    cookie = signIn.headers
      .getSetCookie()
      .map(c => c.split(";")[0])
      .join("; ")
    expect(cookie).toContain("session_token=")
  })

  test("widget admin never reflects a foreign origin", async () => {
    const res = await app.request("/widget/admin", {
      headers: { Authorization: `Bearer ${token}`, origin: attacker }
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).not.toBe(attacker)

    const preflight = await app.request("/widget/admin", {
      method: "OPTIONS",
      headers: { origin: attacker, "access-control-request-method": "POST" }
    })
    expect(preflight.headers.get("access-control-allow-origin")).not.toBe(attacker)
  })

  test("widget turn preflight still reflects any origin", async () => {
    const res = await app.request("/widget/turn", {
      method: "OPTIONS",
      headers: { origin: attacker, "access-control-request-method": "POST" }
    })
    expect(res.headers.get("access-control-allow-origin")).toBe(attacker)
  })

  test("a cookie-authenticated write from another site is refused", async () => {
    const res = await app.request("/sandbox/key", { method: "POST", headers: { cookie, origin: attacker } })
    expect(res.status).toBe(403)
  })

  test("a cookie-authenticated write without an Origin is refused", async () => {
    const res = await app.request("/sandbox/key", { method: "POST", headers: { cookie } })
    expect(res.status).toBe(403)
  })

  test("a cookie-authenticated write from the web app goes through", async () => {
    const res = await app.request("/sandbox/key", { method: "POST", headers: { cookie, origin: env.CORS_ORIGIN } })
    expect(res.status).toBe(200)
  })

  test("a bearer-authenticated write goes through whatever the Origin", async () => {
    const res = await app.request("/sandbox/key", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, origin: attacker }
    })
    expect(res.status).toBe(200)
  })

  test("turn/stream refuses a non-JSON body", async () => {
    const res = await app.request("/nasi/turn/stream", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body: JSON.stringify({ message: "hi" })
    })
    expect(res.status).toBe(400)
  })
})
