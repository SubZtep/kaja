import { expect } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { invalidatePersonaCache } from "../../src/features/nasi/personas"

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

/** Inserts an enabled persona sorted first, so tests don't depend on `bun seed:config` having run. Caller must `cleanupPersona` in `afterAll`. */
export async function seedPersona(namePrefix: string) {
  const personaId = `${namePrefix}-${faker.string.alphanumeric(8).toLowerCase()}`
  const persona = await pool.query<{ id: string }>(
    "INSERT INTO persona (persona_id, label, enabled, sort_order) VALUES ($1, $2, true, -1000) RETURNING id",
    [personaId, `Test persona ${personaId}`]
  )
  // listPersonas caches the catalog for 30 s; drop it so the new row is seen straight away.
  invalidatePersonaCache()
  return { id: persona.rows[0]!.id, personaId }
}

export async function cleanupPersona(id: string) {
  await pool.query("DELETE FROM persona WHERE id = $1", [id])
  invalidatePersonaCache()
}

/** Signs up a fresh user and signs back in, returning the bearer token for authenticated requests. */
export async function signUpAndSignIn(email: string, password: string, name: string): Promise<string> {
  const signUp = await app.request("/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name })
  })
  expect(signUp.ok).toBeTrue()
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
export function fakeChatClient(reply: string) {
  return {
    chat: {
      completions: {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { choices: [{ delta: { content: reply } }] }
          },
          finalChatCompletion: async () => ({
            choices: [{ message: { role: "assistant", content: reply } }]
          })
        })
      }
    }
  }
}
