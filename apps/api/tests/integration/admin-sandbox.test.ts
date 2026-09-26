import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { faker } from "@faker-js/faker"
import { signSandboxToken } from "@kaja/shared"
import { createApp as createSandboxApp } from "../../../sandbox/src/app"
import { ProcessPool } from "../../../sandbox/src/pool"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { setNasiSandboxOverride } from "../../src/features/nasi/chat"
import { signUpAndSignIn } from "./helpers"

const tag = faker.string.alphanumeric(6).toLowerCase()
const secret = `sandbox-${tag}`
const counter = `counter-${tag}`
const adminEmail = `admin-sandbox-${tag}@example.com`
const userEmail = `user-sandbox-${tag}@example.com`

let adminToken: string
let userToken: string
let userId: string
let sandboxPool: ProcessPool
let sandbox: ReturnType<typeof Bun.serve>

beforeAll(async () => {
  adminToken = await signUpAndSignIn(adminEmail, "password123!", "Sandbox Admin")
  userToken = await signUpAndSignIn(userEmail, "password123!", "Sandbox User")
  await pool.query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [adminEmail])
  userId = (await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [userEmail])).rows[0]!.id
  const script = join(import.meta.dir, "../../../sandbox/tests/fixtures/counter-server.ts")
  const servers = new Map([[counter, { name: counter, command: process.execPath, args: [script], env: {} }]])
  sandboxPool = new ProcessPool({ servers, idleMs: 60_000, maxProcesses: 2 })
  sandbox = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: createSandboxApp({ secret, pool: sandboxPool }).fetch })
})

afterAll(async () => {
  setNasiSandboxOverride(undefined)
  await sandboxPool.closeAll()
  await sandbox.stop(true)
  await pool.query('DELETE FROM "user" WHERE email = ANY($1)', [[adminEmail, userEmail]])
})

const stats = (token: string) => app.request("/admin/sandbox", { headers: { Authorization: `Bearer ${token}` } })

describe("GET /admin/sandbox", () => {
  test("is for admins only", async () => {
    expect((await app.request("/admin/sandbox")).status).toBe(401)
    expect((await stats(userToken)).status).toBe(403)
  })

  test("reports a sandbox that doesn't answer, or has another secret, as down", async () => {
    setNasiSandboxOverride({ url: "http://127.0.0.1:1", secret })
    expect(await (await stats(adminToken)).json()).toMatchObject({ status: "down" })
    setNasiSandboxOverride({ url: `http://127.0.0.1:${sandbox.port}`, secret: "another-secret" })
    expect(await (await stats(adminToken)).json()).toMatchObject({ status: "down", error: "the sandbox answered 401" })
  })

  test("shows the running servers with their users' emails", async () => {
    setNasiSandboxOverride({ url: `http://127.0.0.1:${sandbox.port}`, secret })
    // A user's first MCP request starts their server.
    const mcpToken = await signSandboxToken(
      { sub: userId, ability: counter, exp: Math.floor(Date.now() / 1000) + 60 },
      secret
    )
    const initialize = await fetch(`http://127.0.0.1:${sandbox.port}/mcp/${counter}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mcpToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } }
      })
    })
    expect(initialize.status).toBe(200)
    await initialize.text()

    const body = await (await stats(adminToken)).json()
    expect(body).toMatchObject({
      status: "up",
      stats: { abilities: [counter], limits: { maxProcesses: 2 }, pool: { started: 1 } },
      emails: { [userId]: userEmail }
    })
    expect(body.stats.servers).toEqual([expect.objectContaining({ user: userId, ability: counter, state: "running" })])
  }, 30_000)
})
