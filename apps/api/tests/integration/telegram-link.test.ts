import { expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { sql } from "../../src/core/db"
import { telegramLinkService } from "../../src/services"
import { signUpAndSignIn } from "./helpers"

test("the web sees whether the account is linked to Telegram, and can disconnect it", async () => {
  const email = faker.internet.email().toLowerCase()
  const token = await signUpAndSignIn(email, "Link")
  const [{ id: userId }] = await sql`SELECT id FROM "user" WHERE email = ${email}`
  const headers = { Authorization: `Bearer ${token}` }
  const status = async () =>
    (await app.request("/telegram/link", { headers })).json() as Promise<{
      linked: boolean
      linkedAt: string | null
    }>

  expect(await status()).toEqual({ linked: false, linkedAt: null })
  expect((await app.request("/telegram/link", { method: "DELETE", headers })).status).toBe(404)

  const telegramUserId = faker.number.int({ min: 1_000_000, max: 9_000_000_000 })
  expect(await telegramLinkService.link(telegramUserId, userId)).toBe(true)
  const linked = await status()
  expect(linked.linked).toBe(true)
  expect(Number.isNaN(Date.parse(linked.linkedAt!))).toBe(false)

  expect((await app.request("/telegram/link", { method: "DELETE", headers })).status).toBe(200)
  expect(await status()).toEqual({ linked: false, linkedAt: null })
  expect(await telegramLinkService.resolveUserId(telegramUserId)).toBeUndefined()

  expect((await app.request("/telegram/link")).status).toBe(401)
})

test("a link token is consumed once: the second delete finds no row", async () => {
  const email = faker.internet.email().toLowerCase()
  await signUpAndSignIn(email, "Token")
  const [{ id }] = await sql`SELECT id FROM "user" WHERE email = ${email}`
  const { token } = await telegramLinkService.createLinkToken(id)
  expect(await telegramLinkService.peekLinkToken(token)).toMatchObject({ userId: id, email })
  // A new token replaces the outstanding one
  const { token: newer } = await telegramLinkService.createLinkToken(id)
  expect(await telegramLinkService.peekLinkToken(token)).toBeUndefined()
  expect(await telegramLinkService.deleteLinkToken(newer)).toBe(true)
  expect(await telegramLinkService.deleteLinkToken(newer)).toBe(false)
})
