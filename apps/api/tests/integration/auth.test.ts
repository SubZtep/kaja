import { describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { userImagePrefix } from "@kaja/nasi"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { objects } from "../../src/core/files"
import { signInCode, signInWithCode, signUpAndSignIn } from "./helpers"

describe("authentication flow", () => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const email = faker.internet.email({ firstName, lastName })

  describe("registration", () => {
    test("with an emailed code", async () => {
      const res = await signInWithCode(email, { name: `${firstName} ${lastName}`, consent: true })
      expect(res.status).toBe(200)
      // The code proved the address, so there's no separate verification step
      expect((await res.json()).user.emailVerified).toBeTrue()
    })

    test("with a blank name", async () => {
      const res = await signInWithCode(faker.internet.email(), { name: "", consent: true })
      expect(res.status).toBe(200)
      expect((await res.json()).user.name).toBe("")
    })

    test("records when the user consented", async () => {
      const { rows } = await pool.query('SELECT consented_at FROM "user" WHERE email = lower($1)', [email])
      expect(rows[0].consented_at).toBeInstanceOf(Date)
    })

    test("is refused without the sign-up page's consent", async () => {
      const refused = faker.internet.email()
      const res = await signInWithCode(refused, { name: "" })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("CONSENT_REQUIRED")
      const { rowCount } = await pool.query('SELECT 1 FROM "user" WHERE email = lower($1)', [refused])
      expect(rowCount).toBe(0)
    })

    test("passwords are gone", async () => {
      const passwordEmail = faker.internet.email()
      const res = await app.request("/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: passwordEmail, password: "P4$sword", name: "", consent: true })
      })
      expect(res.ok).toBeFalse()
      const { rowCount } = await pool.query('SELECT 1 FROM "user" WHERE email = lower($1)', [passwordEmail])
      expect(rowCount).toBe(0)
    })
  })

  describe("bearer token", () => {
    let token: string

    test("a wrong code is refused", async () => {
      const code = await signInCode(email)
      const res = await app.request("/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code === "000000" ? "111111" : "000000" })
      })
      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe("INVALID_OTP")
    })

    test("a code works once", async () => {
      const otp = await signInCode(email)
      const signIn = () =>
        app.request("/auth/sign-in/email-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp })
        })
      expect((await signIn()).status).toBe(200)
      expect((await signIn()).status).toBe(400)
    })

    test("only sign-in codes are sent, and the plugin's other code flows are off", async () => {
      const post = (path: string, body: object) =>
        app.request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        })
      expect((await post("/auth/email-otp/send-verification-otp", { email, type: "email-verification" })).status).toBe(
        400
      )
      expect((await post("/auth/email-otp/send-verification-otp", { email, type: "forget-password" })).status).toBe(400)
      expect((await post("/auth/email-otp/verify-email", { email, otp: "123456" })).status).toBe(404)
      expect((await post("/auth/email-otp/reset-password", { email, otp: "123456", password: "x" })).status).toBe(404)
    })

    test("sign in", async () => {
      const res = await signInWithCode(email)
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
      const token = await signUpAndSignIn(doomed, "")
      const { rows } = await pool.query('SELECT id FROM "user" WHERE email = $1', [doomed])
      // Their images in object storage go with them: a session's, and its description beside it
      const keys = [`${userImagePrefix(rows[0].id)}/session/abc`, `${userImagePrefix(rows[0].id)}/session/abc.json`]
      for (const key of keys) await objects.put(key, new Uint8Array([1]), "image/png")
      const res = await app.request("/auth/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({})
      })
      expect(res.status).toBe(200)
      const { rowCount } = await pool.query('SELECT 1 FROM "user" WHERE email = $1', [doomed])
      expect(rowCount).toBe(0)
      for (const key of keys) expect(await objects.exists(key)).toBe(false)
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
