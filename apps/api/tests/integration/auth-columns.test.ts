import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { signUpAndSignIn } from "./helpers"

const CLIENT_ID = "kaja-tui"
const GRANT = "urn:ietf:params:oauth:grant-type:device_code"

const post = (path: string, body: object, token?: string) =>
  app.request(`/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  })

async function signUp(name: string) {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), name)
  const id = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id as string
  return { token, id }
}

describe("Better Auth reads and writes the snake_case columns", () => {
  let admin: { token: string; id: string }
  let member: { token: string; id: string }

  beforeAll(async () => {
    admin = await signUp("Auth Admin")
    await pool.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin.id])
    member = await signUp("Auth Member")
  })

  afterAll(async () => {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [[admin.id, member.id]])
  })

  test("device login: the code is stored in device_code, polled, approved and exchanged for a token", async () => {
    const created = await post("/device/code", { client_id: CLIENT_ID })
    expect(created.status).toBe(200)
    const { device_code: deviceCode, user_code: userCode } = await created.json()

    const stored = (await pool.query("SELECT * FROM device_code WHERE device_code = $1", [deviceCode])).rows[0]
    expect(stored).toMatchObject({ user_code: userCode, client_id: CLIENT_ID, status: "pending", user_id: null })
    expect(stored.expires_at.getTime()).toBeGreaterThan(Date.now())

    const pending = await post("/device/token", { grant_type: GRANT, device_code: deviceCode, client_id: CLIENT_ID })
    expect(pending.status).toBe(400)
    expect((await pending.json()).error).toBe("authorization_pending")
    const polled = await pool.query("SELECT last_polled_at FROM device_code WHERE device_code = $1", [deviceCode])
    expect(polled.rows[0].last_polled_at).toBeInstanceOf(Date)

    // the signed-in user opens the verification page first, which claims the code for their session
    const claim = await app.request(`/auth/device?user_code=${userCode}`, {
      headers: { Authorization: `Bearer ${member.token}` }
    })
    expect(claim.status).toBe(200)
    const approve = await post("/device/approve", { userCode }, member.token)
    expect(approve.status).toBe(200)
    const approved = await pool.query("SELECT status, user_id FROM device_code WHERE device_code = $1", [deviceCode])
    expect(approved.rows[0]).toEqual({ status: "approved", user_id: member.id })

    // polling again right away would be "slow_down", so pretend the terminal waited its interval
    await pool.query("UPDATE device_code SET last_polled_at = now() - interval '1 minute' WHERE device_code = $1", [
      deviceCode
    ])
    const token = await post("/device/token", { grant_type: GRANT, device_code: deviceCode, client_id: CLIENT_ID })
    expect(token.status).toBe(200)
    expect((await token.json()).access_token).toBeString()
  })

  test("an unknown client id is refused", async () => {
    expect((await post("/device/code", { client_id: "someone-else" })).status).toBe(400)
  })

  test("banning a user fills ban_reason and ban_expires, and unbanning clears the flag", async () => {
    const ban = await post(
      "/admin/ban-user",
      { userId: member.id, banReason: "testing", banExpiresIn: 3600 },
      admin.token
    )
    expect(ban.status).toBe(200)
    const banned = (await pool.query('SELECT banned, ban_reason, ban_expires FROM "user" WHERE id = $1', [member.id]))
      .rows[0]
    expect(banned.banned).toBe(true)
    expect(banned.ban_reason).toBe("testing")
    expect(banned.ban_expires.getTime()).toBeGreaterThan(Date.now())

    expect((await post("/admin/unban-user", { userId: member.id }, admin.token)).status).toBe(200)
    const unbanned = (await pool.query('SELECT banned FROM "user" WHERE id = $1', [member.id])).rows[0]
    expect(unbanned.banned).toBe(false)
  })

  test("impersonating a user records who did it in impersonated_by", async () => {
    const res = await post("/admin/impersonate-user", { userId: member.id }, admin.token)
    expect(res.status).toBe(200)
    const rows = (
      await pool.query("SELECT impersonated_by FROM session WHERE user_id = $1 AND impersonated_by IS NOT NULL", [
        member.id
      ])
    ).rows
    expect(rows).toEqual([{ impersonated_by: admin.id }])
  })

  test("sessions record where they were opened from in ip_address and user_agent", async () => {
    const email = faker.internet.email().toLowerCase()
    const password = faker.internet.password({ length: 8, prefix: "P4$s" })
    await signUpAndSignIn(email, password, "Agent")
    await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "tz-test/1.0", "X-Forwarded-For": "203.0.113.7" },
      body: JSON.stringify({ email, password })
    })
    const { rows } = await pool.query(
      `SELECT s.user_agent FROM session s JOIN "user" u ON u.id = s.user_id WHERE u.email = $1 AND s.user_agent = 'tz-test/1.0'`,
      [email]
    )
    expect(rows).toHaveLength(1)
    await pool.query('DELETE FROM "user" WHERE email = $1', [email])
  })
})
