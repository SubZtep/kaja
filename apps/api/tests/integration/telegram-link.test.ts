import { expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { telegramLinkService } from "../../src/services"
import { signUpAndSignIn } from "./helpers"

test("the web sees whether the account is linked to Telegram, and can disconnect it", async () => {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), "Link")
  const userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id
  const headers = { Authorization: `Bearer ${token}` }
  const status = async () => (await app.request("/telegram/admin/link", { headers })).json()

  expect(await status()).toEqual({ linked: false, linkedAt: null })
  expect((await app.request("/telegram/admin/link", { method: "DELETE", headers })).status).toBe(404)

  const telegramUserId = faker.number.int({ min: 1_000_000, max: 9_000_000_000 })
  expect(await telegramLinkService.link(telegramUserId, userId)).toBe(true)
  const linked = await status()
  expect(linked.linked).toBe(true)
  expect(Number.isNaN(Date.parse(linked.linkedAt))).toBe(false)

  expect((await app.request("/telegram/admin/link", { method: "DELETE", headers })).status).toBe(200)
  expect(await status()).toEqual({ linked: false, linkedAt: null })
  expect(await telegramLinkService.resolveUserId(telegramUserId)).toBeUndefined()

  expect((await app.request("/telegram/admin/link")).status).toBe(401)
})
