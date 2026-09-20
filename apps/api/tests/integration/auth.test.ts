import { describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { env } from "../../src/core/env"
import { verifyEmail } from "./helpers"

describe("authentication flow", () => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const email = faker.internet.email({ firstName, lastName })
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })

  describe("registration", () => {
    test("with email", async () => {
      const res = await app.request("/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: `${firstName} ${lastName}` })
      })
      expect(res.ok).toBeTrue()
      expect(res.status).toBe(200)
    })
  })

  describe("bearer token", () => {
    let token: string

    test("sign in is refused until the email is verified", async () => {
      const res = await app.request("/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      expect(res.status).toBe(403)
      await verifyEmail(email)
    })

    test("sign in", async () => {
      const res = await app.request("/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      expect(res.ok).toBeTrue()
      expect(res.status).toBe(200)
      token = (await res.json()).token
      expect(token).not.toBeEmpty()
    })

    test("request profile", async () => {
      const res = await app.request("/users/me", {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.status).toBe(200)
    })

    test("sign out", async () => {
      const res = await app.request("/auth/sign-out", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.status).toBe(200)
    })
  })

  describe("google sign-in", () => {
    test.skipIf(!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)(
      "returns the Google authorization url",
      async () => {
        const res = await app.request("/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: env.CORS_ORIGIN },
          body: JSON.stringify({ provider: "google", callbackURL: new URL("/dashboard", env.CORS_ORIGIN).toString() })
        })
        expect(res.status).toBe(200)
        const { url } = (await res.json()) as { url: string }
        const authUrl = new URL(url)
        expect(authUrl.origin).toBe("https://accounts.google.com")
        expect(authUrl.searchParams.get("client_id")).toBe(env.GOOGLE_CLIENT_ID as string)
        expect(authUrl.searchParams.get("redirect_uri")).toEndWith("/auth/callback/google")
      }
    )
  })
})
