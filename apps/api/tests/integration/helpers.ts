import { expect } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"

/** Inserts a provider + an enabled/free chat model under it, returning both ids. Caller must `cleanupModel` in `afterAll`. */
export async function seedModel(namePrefix: string) {
  const provider = await pool.query<{ id: string }>(
    "INSERT INTO provider (name, base_url) VALUES ($1, $2) RETURNING id",
    [`${namePrefix}-${faker.string.alphanumeric(8)}`, "http://localhost:1"]
  )
  const providerId = provider.rows[0]!.id
  const modelName = `${namePrefix}-${faker.string.alphanumeric(8)}`
  await pool.query("INSERT INTO model (provider_id, model, tasks, enabled, free) VALUES ($1, $2, $3, true, true)", [
    providerId,
    modelName,
    ["chat"]
  ])
  return { providerId, modelName }
}

export async function cleanupModel(providerId: string) {
  await pool.query("DELETE FROM provider WHERE id = $1", [providerId])
}

/** Marks an account's email as verified, standing in for clicking the link in the verification mail (sign-in is refused until then). */
export async function verifyEmail(email: string): Promise<void> {
  await pool.query('UPDATE "user" SET email_verified = true WHERE email = lower($1)', [email])
}

/** Signs up a fresh user, verifies their email and signs back in, returning the bearer token for authenticated requests. */
export async function signUpAndSignIn(email: string, password: string, name: string): Promise<string> {
  const signUp = await app.request("/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, consent: true })
  })
  expect(signUp.ok).toBeTrue()
  await verifyEmail(email)
  const signIn = await app.request("/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })
  return (await signIn.json()).token
}

/** Asserts a request without an Authorization header is rejected with 401. */
export async function expectUnauthenticated(path: string, init?: RequestInit): Promise<void> {
  const res = await app.request(path, init)
  expect(res.status).toBe(401)
}

/** An OpenAI-shaped chat client that streams and finalizes to the same fixed reply. */
/** A chat client that always streams `reply`; `onRequest` sees each request (e.g. to check the tools a turn offered). */
export function fakeChatClient(
  reply: string,
  onRequest?: (params: { tools?: { function: { name: string } }[] }) => void
) {
  return {
    chat: {
      completions: {
        stream: (params: { tools?: { function: { name: string } }[] }) => {
          onRequest?.(params)
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: reply } }] }
            },
            finalChatCompletion: async () => ({
              choices: [{ message: { role: "assistant", content: reply } }]
            })
          }
        },
        // The summarizer, for /nasi/compact.
        create: async () => ({ choices: [{ message: { content: "SUMMARY" } }] })
      }
    }
  }
}
