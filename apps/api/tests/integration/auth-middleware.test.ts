import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { Hono } from "hono"
import { app } from "../../src/app"
import { sessionUser } from "../../src/features/auth"
import { auth } from "../../src/features/auth/auth"
import type { RouteVariables } from "../../src/types"
import { signUpAndSignIn } from "./helpers"

describe("session lookup", () => {
  const email = faker.internet.email()
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string
  let cookie: string
  let getSession: ReturnType<typeof spyOn<typeof auth.api, "getSession">> | undefined

  beforeAll(async () => {
    token = await signUpAndSignIn(email, password, "Session Tester")
    const signIn = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    cookie = signIn.headers
      .getSetCookie()
      .map(c => c.split(";")[0])
      .join("; ")
  })

  afterEach(() => getSession?.mockRestore())

  const lookups = () => {
    getSession = spyOn(auth.api, "getSession")
    return () => getSession!.mock.calls.length
  }

  test("a request without credentials never looks a session up", async () => {
    const count = lookups()
    expect((await app.request("/health")).status).toBe(200)
    expect((await app.request("/stats")).status).toBe(401)
    expect(count()).toBe(0)
  })

  test("a bearer token is looked up once, and a bad one doesn't fall back to the cookie", async () => {
    const count = lookups()
    expect((await app.request("/stats", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200)
    expect(count()).toBe(1)
    const res = await app.request("/stats", { headers: { Authorization: "Bearer not-a-session", cookie } })
    expect(res.status).toBe(401)
    expect(count()).toBe(2)
  })

  test("a session cookie alone signs the request in", async () => {
    const count = lookups()
    expect((await app.request("/stats", { headers: { cookie } })).status).toBe(200)
    expect(count()).toBe(1)
  })

  test("sessionUser on a route mounted without requireAuthMiddleware answers 401 instead of running", async () => {
    const bare = new Hono<{ Variables: RouteVariables }>()
    bare.get("/", c => c.json({ id: sessionUser(c).id }))
    const res = await bare.request("/")
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
  })
})
