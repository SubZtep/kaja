import { expect } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { auth } from "../../src/features/auth/auth"

/** Inserts a provider + an enabled/free model (chat unless `tasks` says otherwise) under it, returning both ids. Caller must `cleanupModel` in `afterAll`. */
export async function seedModel(namePrefix: string, tasks: string[] = ["chat"]) {
  const provider = await pool.query<{ id: string }>(
    "INSERT INTO provider (name, base_url) VALUES ($1, $2) RETURNING id",
    [`${namePrefix}-${faker.string.alphanumeric(8)}`, "http://localhost:1"]
  )
  const providerId = provider.rows[0]!.id
  const modelName = `${namePrefix}-${faker.string.alphanumeric(8)}`
  await pool.query("INSERT INTO model (provider_id, model, tasks, enabled, free) VALUES ($1, $2, $3, true, true)", [
    providerId,
    modelName,
    tasks
  ])
  return { providerId, modelName }
}

export async function cleanupModel(providerId: string) {
  await pool.query("DELETE FROM provider WHERE id = $1", [providerId])
}

// The email OTP plugin's server-only endpoint; auth.ts types its plugin list loosely, so `auth.api` doesn't infer it.
const otpApi = auth.api as unknown as {
  createVerificationOTP: (args: { body: { email: string; type: CodeType } }) => Promise<string>
}

type CodeType = "sign-in" | "email-verification" | "change-email"

/** A fresh code of `type` for `email`, standing in for the one the email would carry; an email change's new-address code is keyed `<current>-<new>`. */
export async function emailCode(email: string, type: CodeType): Promise<string> {
  return await otpApi.createVerificationOTP({ body: { email, type } })
}

/** A fresh sign-in code for `email`, standing in for the one the email would carry. */
export async function signInCode(email: string): Promise<string> {
  return await emailCode(email, "sign-in")
}

/** Signs in with a fresh emailed code; `body` adds fields such as `consent`, which a new address needs to become an account. */
export async function signInWithCode(
  email: string,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<Response> {
  return await app.request("/auth/sign-in/email-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ email, otp: await signInCode(email), ...body })
  })
}

/** Signs up a fresh user with an emailed code, returning the bearer token for authenticated requests. */
export async function signUpAndSignIn(email: string, name: string): Promise<string> {
  const res = await signInWithCode(email, { name, consent: true })
  expect(res.ok).toBeTrue()
  return (await res.json()).token
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
            // A plain iterable: `for await` takes those too
            *[Symbol.iterator]() {
              yield { choices: [{ delta: { content: reply } }] }
            },
            finalChatCompletion: () =>
              Promise.resolve({ choices: [{ message: { role: "assistant", content: reply } }] })
          }
        },
        // The summarizer, for /nasi/compact.
        create: () => Promise.resolve({ choices: [{ message: { content: "SUMMARY" } }] })
      }
    }
  }
}
