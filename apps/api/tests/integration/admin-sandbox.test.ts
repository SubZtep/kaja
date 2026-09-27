import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { signUpAndSignIn } from "./helpers"
import { serveApi, startSandbox, type TestSandbox } from "./sandbox-helpers"

const tag = faker.string.alphanumeric(6).toLowerCase()
const counter = `counter-${tag}`
const adminEmail = `admin-sandbox-${tag}@example.com`
const userEmail = `user-sandbox-${tag}@example.com`

let adminToken: string
let userToken: string
let userId: string
let server: ReturnType<typeof serveApi>
let sandbox: TestSandbox

beforeAll(async () => {
  adminToken = await signUpAndSignIn(adminEmail, "password123!", "Sandbox Admin")
  userToken = await signUpAndSignIn(userEmail, "password123!", "Sandbox User")
  await pool.query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [adminEmail])
  userId = (await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [userEmail])).rows[0]!.id
  server = serveApi()
  const { key } = await (
    await app.request("/sandbox/key", { method: "POST", headers: { Authorization: `Bearer ${userToken}` } })
  ).json()
  sandbox = await startSandbox({ apiUrl: `http://127.0.0.1:${server.port}`, abilities: [counter], key })
}, 30_000)

afterAll(async () => {
  await sandbox.close()
  server.stop(true)
  await pool.query('DELETE FROM "user" WHERE email = ANY($1)', [[adminEmail, userEmail]])
})

const stats = (token: string) => app.request("/admin/sandbox", { headers: { Authorization: `Bearer ${token}` } })

describe("GET /admin/sandbox", () => {
  test("is for admins only", async () => {
    expect((await app.request("/admin/sandbox")).status).toBe(401)
    expect((await stats(userToken)).status).toBe(403)
  })

  test("lists the sandboxes with their owners, and an online one's running servers with their users", async () => {
    // A user's first MCP request starts their server; the sandbox only ever sees a pseudonym for them.
    const { mcpSandboxFor } = await import("../../src/features/sandbox")
    const initialize = await mcpSandboxFor(userId).fetch(`http://sandbox.invalid/mcp/${counter}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } }
      })
    })
    expect(initialize.status).toBe(200)
    await initialize.text()
    const pseudonym = sandbox.pool.servers()[0]!.user
    expect(pseudonym).not.toBe(userId)

    const body = await (await stats(adminToken)).json()
    const entry = body.sandboxes.find((item: { sandbox: { id: string } }) => item.sandbox.id === sandbox.id)
    expect(entry).toMatchObject({
      sandbox: { kind: "owned", ownerId: userId, online: true, info: { abilities: [counter], maxProcesses: 2 } },
      stats: { abilities: [counter], limits: { maxProcesses: 2 }, pool: { started: 1 } },
      error: null
    })
    expect(entry.stats.servers).toEqual([expect.objectContaining({ user: userId, ability: counter, state: "running" })])
    expect(body.emails[userId]).toBe(userEmail)
  }, 30_000)
})
