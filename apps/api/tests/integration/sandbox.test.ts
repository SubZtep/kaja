import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { faker } from "@faker-js/faker"
import { SANDBOX_KEY_HEADER } from "@kaja/schema/api"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { lookupGeo, setGeoLookupOverride } from "../../src/core/geo"
import { pickSandbox } from "../../src/features/sandbox/registry"
import { signUpAndSignIn } from "./helpers"
import { serveApi, startSandbox, waitFor } from "./sandbox-helpers"

const tag = faker.string.alphanumeric(6).toLowerCase()
const ability = `counter-${tag}`
const emails = ["a", "b"].map(who => `sandbox-${who}-${tag}@example.com`)

let server: ReturnType<typeof serveApi>
let apiUrl: string
let tokenA: string
let tokenB: string
let userA: string

const as = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" })
const newKey = async (token: string): Promise<string> =>
  (await (await app.request("/sandbox/key", { method: "POST", headers: as(token) })).json()).key
const settings = (token: string, patch: object) =>
  app.request("/sandbox/settings", { method: "PATCH", headers: as(token), body: JSON.stringify(patch) })
const rowOf = async (id: string) =>
  (
    await pool.query<{ online: boolean; user_id: string | null }>(
      "SELECT online, user_id::text FROM sandbox WHERE id = $1",
      [id]
    )
  ).rows[0]

beforeAll(async () => {
  tokenA = await signUpAndSignIn(emails[0]!, "password123!", "Sandbox A")
  tokenB = await signUpAndSignIn(emails[1]!, "password123!", "Sandbox B")
  userA = (await pool.query<{ id: string }>('SELECT id::text FROM "user" WHERE email = $1', [emails[0]])).rows[0]!.id
  server = serveApi()
  apiUrl = `http://127.0.0.1:${server.port}`
}, 30_000)

afterAll(async () => {
  server.stop(true)
  await pool.query("DELETE FROM sandbox WHERE info->>'name' = 'test' AND user_id IS NULL AND NOT online")
  await pool.query('DELETE FROM "user" WHERE email = ANY($1)', [emails])
})

describe("connecting", () => {
  test("a key nobody has is refused before the socket opens", async () => {
    const res = await app.request("/sandbox/connect", { headers: { [SANDBOX_KEY_HEADER]: "ks_nobody" } })
    expect(res.status).toBe(401)
  })

  test("without a key a sandbox is anonymous; restarted with its state it comes back as the same row, offline in between", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "kaja-sandbox-state-"))
    try {
      const first = await startSandbox({ apiUrl, abilities: [ability], stateDir })
      expect(await rowOf(first.id)).toEqual({ online: true, user_id: null })
      await first.close()
      await waitFor(async () => ((await rowOf(first.id))?.online === false ? true : undefined))
      const again = await startSandbox({ apiUrl, abilities: [ability], stateDir })
      expect(again.id).toBe(first.id)
      await again.close()
    } finally {
      rmSync(stateDir, { recursive: true, force: true })
    }
  }, 30_000)

  test("a user's key links the sandbox to them, and a new key retires the old one", async () => {
    const key = await newKey(tokenA)
    expect(key).toStartWith("ks_")
    const sandbox = await startSandbox({ apiUrl, abilities: [ability], key })
    try {
      expect(await rowOf(sandbox.id)).toEqual({ online: true, user_id: userA })
      const mine = await (await app.request("/sandbox", { headers: as(tokenA) })).json()
      expect(mine.settings).toMatchObject({ share: true, useShared: false, hasKey: true })
      expect(mine.sandboxes).toEqual([expect.objectContaining({ id: sandbox.id, kind: "owned", online: true })])
    } finally {
      await sandbox.close()
    }
    await newKey(tokenA)
    const old = await app.request("/sandbox/connect", { headers: { [SANDBOX_KEY_HEADER]: key } })
    expect(old.status).toBe(401)
    // An offline sandbox of your own can be removed; someone else's can't.
    expect((await app.request(`/sandbox/${sandbox.id}`, { method: "DELETE", headers: as(tokenB) })).status).toBe(404)
    expect((await app.request(`/sandbox/${sandbox.id}`, { method: "DELETE", headers: as(tokenA) })).status).toBe(200)
  }, 30_000)
})

describe("routing", () => {
  test("own sandbox first; others' only when the user allows it and the owner shares", async () => {
    const own = await startSandbox({ apiUrl, abilities: [ability], key: await newKey(tokenA) })
    const theirs = await startSandbox({ apiUrl, abilities: [ability], key: await newKey(tokenB) })
    try {
      expect((await pickSandbox(userA, ability))?.id).toBe(own.id)
      expect(await pickSandbox(userA, "not-an-ability")).toBeUndefined()
      await own.close()
      expect(await pickSandbox(userA, ability)).toBeUndefined()
      expect((await settings(tokenA, { useShared: true })).status).toBe(200)
      expect((await pickSandbox(userA, ability))?.id).toBe(theirs.id)
      expect(await (await settings(tokenB, { share: false })).json()).toMatchObject({ share: false, useShared: false })
      expect(await pickSandbox(userA, ability)).toBeUndefined()
    } finally {
      await theirs.close()
      await settings(tokenA, { useShared: false })
      await settings(tokenB, { share: true })
    }
  }, 30_000)

  test("the public count shows how many are online", async () => {
    const sandbox = await startSandbox({ apiUrl, abilities: [ability] })
    try {
      const counts = await (await app.request("/sandbox/public")).json()
      expect(counts.online).toBeGreaterThanOrEqual(1)
    } finally {
      await sandbox.close()
    }
  }, 30_000)
})

describe("geolocation", () => {
  test("private and malformed addresses aren't looked up; public ones are", async () => {
    const asked: string[] = []
    setGeoLookupOverride(async ip => {
      asked.push(ip)
      return { raw: {}, country: "Hungary", countryCode: "HU", city: null, latitude: 47.5, longitude: 19 }
    })
    try {
      expect(await lookupGeo("127.0.0.1")).toBeUndefined()
      expect(await lookupGeo("10.1.2.3")).toBeUndefined()
      expect(await lookupGeo("unknown")).toBeUndefined()
      expect(await lookupGeo("84.2.3.4")).toMatchObject({ countryCode: "HU" })
      expect(asked).toEqual(["84.2.3.4"])
    } finally {
      setGeoLookupOverride(undefined)
    }
  })
})
