import { describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { userImagePrefix } from "@kaja/nasi"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { files, toolImagePrefix } from "../../src/core/files"
import { signUpAndSignIn, verifyEmail } from "./helpers"

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
        body: JSON.stringify({ email, password, name: `${firstName} ${lastName}`, consent: true })
      })
      expect(res.ok).toBeTrue()
      expect(res.status).toBe(200)
    })

    test("with email and a blank name", async () => {
      const res = await app.request("/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: faker.internet.email(), password, name: "", consent: true })
      })
      expect(res.status).toBe(200)
      expect((await res.json()).user.name).toBe("")
    })

    test("records when the user consented", async () => {
      const { rows } = await pool.query('SELECT consented_at FROM "user" WHERE email = lower($1)', [email])
      expect(rows[0].consented_at).toBeInstanceOf(Date)
    })

    test("is refused without the sign-up page's consent", async () => {
      const refused = faker.internet.email()
      const res = await app.request("/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: refused, password, name: "" })
      })
      expect(res.status).toBe(400)
      const { rowCount } = await pool.query('SELECT 1 FROM "user" WHERE email = lower($1)', [refused])
      expect(rowCount).toBe(0)
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

    test("call a session route with the bearer token", async () => {
      const res = await app.request("/abilities/me", {
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

  describe("account deletion", () => {
    test("a freshly signed-in user can delete their own account", async () => {
      const doomed = faker.internet.email().toLowerCase()
      const token = await signUpAndSignIn(doomed, password, "")
      const { rows } = await pool.query('SELECT id FROM "user" WHERE email = $1', [doomed])
      // Their images in object storage go with them: a session's and a leftover tool image
      const keys = [`${userImagePrefix(rows[0].id)}/session/abc`, `${toolImagePrefix(rows[0].id)}/def`]
      for (const key of keys) await files.upload(key, new Uint8Array([1]), { contentType: "image/png" })
      const res = await app.request("/auth/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({})
      })
      expect(res.status).toBe(200)
      const { rowCount } = await pool.query('SELECT 1 FROM "user" WHERE email = $1', [doomed])
      expect(rowCount).toBe(0)
      for (const key of keys) expect(await files.exists(key)).toBe(false)
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
