import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import type { UsageStatsResponse } from "@kaja/schema/api"
import { SQL } from "bun"
import { z } from "zod"
import { app } from "../../src/app"
import { sql } from "../../src/core/db"
import { nasiStore } from "../../src/features/nasi/store"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

// The moment everything below points at: 00:30 UTC on 20 Sep 2026 (09:30 in Tokyo, 17:30 the day before in Los Angeles).
const INSTANT = new Date("2026-09-20T00:30:00Z")
const INSTANT_EPOCH = INSTANT.getTime() / 1000
const ZONES = ["UTC", "Asia/Tokyo", "America/Los_Angeles"] as const

/** A client whose session timezone is `zone`, standing in for a client somewhere else on Earth. */
const connectIn = (zone: string) => new SQL({ url: Bun.env.DATABASE_URL, max: 1, connection: { TimeZone: zone } })

/** The `YYYY-MM-DD` calendar day `instant` falls on in `zone`. */
const dayIn = (instant: Date, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(instant)

describe("timestamps are absolute instants, whoever inserts and reads them", () => {
  const table = `tz_probe_${faker.string.alphanumeric({ length: 8, casing: "lower" })}`
  const clients = ZONES.map(connectIn)

  beforeAll(async () => {
    await sql`CREATE TABLE ${sql(table)} (id serial PRIMARY KEY, label text NOT NULL, at timestamptz NOT NULL)`
    const [utc, tokyo, la] = clients as [SQL, SQL, SQL]
    const insert = (client: SQL, label: string, at: string | Date) =>
      client`INSERT INTO ${client(table)} (label, at) VALUES (${label}, ${at})`

    // Wall-clock literals without an offset mean "my local time", so each zone writes its own reading of the instant.
    await insert(utc, "utc-wall", "2026-09-20 00:30:00")
    await insert(tokyo, "tokyo-wall", "2026-09-20 09:30:00")
    await insert(la, "la-wall", "2026-09-19 17:30:00")
    // Literals with an explicit offset are the same instant whatever the session zone is.
    await insert(la, "tokyo-offset", "2026-09-20T09:30:00+09:00")
    await insert(tokyo, "ny-offset", "2026-09-19T20:30:00-04:00")
    // A JS Date is an instant too, from any session.
    for (const [zone, client] of ZONES.map((name, i) => [name, clients[i]!] as const)) {
      await insert(client, `date-from-${zone}`, INSTANT)
    }
    // Something clearly earlier and later, to give the range queries an edge to fall on.
    await insert(utc, "before", "2026-09-20T00:29:59Z")
    await insert(utc, "after", "2026-09-20T00:30:01Z")
  })

  afterAll(async () => {
    for (const client of clients) await client.close()
    await sql`DROP TABLE IF EXISTS ${sql(table)}`
  })

  test("every way of writing the same moment is stored as the same instant", async () => {
    const rows = await sql<{ label: string; epoch: number }[]>`
      SELECT label, extract(epoch FROM at)::float8 AS epoch FROM ${sql(table)} WHERE label NOT IN ('before', 'after')`
    expect(rows).toHaveLength(8)
    for (const row of rows) expect(row.epoch).toBe(INSTANT_EPOCH)
  })

  test("range queries give the same rows from a session in any timezone", async () => {
    const from = new Date("2026-09-20T00:30:00Z")
    const to = new Date("2026-09-20T00:30:01Z")
    const results: string[][] = []
    for (const client of clients) {
      const rows = await client<{ label: string }[]>`
        SELECT label FROM ${client(table)} WHERE at >= ${from} AND at < ${to} ORDER BY label`
      results.push(rows.map(row => row.label))
    }
    expect(results[0]).toHaveLength(8)
    expect(results[1]).toEqual(results[0]!)
    expect(results[2]).toEqual(results[0]!)
  })

  test("ordering and comparing across writers follows the instant, not the wall clock", async () => {
    // Tokyo's wall clock reads 09:30 and LA's 17:30 for the same instant, so text order would disagree with time order.
    const rows = await sql<{ label: string }[]>`
      SELECT label FROM ${sql(table)} WHERE at > ${INSTANT} OR at < ${INSTANT} ORDER BY at`
    expect(rows.map(row => row.label)).toEqual(["before", "after"])
  })

  test("each session shows its own local reading of the one instant", async () => {
    const shown: Record<string, string> = {}
    for (const [i, zone] of ZONES.entries()) {
      const client = clients[i]!
      const [row] = await client<{ shown: string }[]>`
        SELECT to_char(at, 'YYYY-MM-DD HH24:MI') AS shown FROM ${client(table)} WHERE label = 'utc-wall'`
      shown[zone] = row!.shown
    }
    expect(shown).toEqual({
      UTC: "2026-09-20 00:30",
      "Asia/Tokyo": "2026-09-20 09:30",
      "America/Los_Angeles": "2026-09-19 17:30"
    })
  })
})

describe("schema keeps every timestamp an instant", () => {
  test("no column stores a wall clock without a timezone", async () => {
    const rows = await sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`
    expect([...rows]).toEqual([])
  })

  test("every *_at / *At column is timestamptz, not text or a number", async () => {
    const rows = await sql`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name ~ '(_at|At)$' AND data_type <> 'timestamp with time zone'`
    expect([...rows]).toEqual([])
  })
})

describe("the API hands times out as UTC", () => {
  const email = faker.internet.email()
  let token: string
  let userId: string
  let providerId: string
  let modelName: string

  beforeAll(async () => {
    token = await signUpAndSignIn(email, "Zone Tester")
    userId = (await sql`SELECT id FROM "user" WHERE email = ${email.toLowerCase()}`)[0].id
    ;({ providerId, modelName } = await seedModel("zone-widget"))
  })

  afterAll(async () => {
    await sql`DELETE FROM "user" WHERE id = ${userId}`
    await cleanupModel(providerId)
  })

  test("a stored instant reaches the client as one UTC ISO string and parses back to the same moment", async () => {
    const created = await app.request("/widget/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        label: "Zone widget",
        intent: "Ask one question.",
        model: modelName,
        target: { kind: "server" }
      })
    })
    expect(created.status).toBe(201)
    const { id } = await created.json()
    await sql`UPDATE widget SET created_at = ${INSTANT} WHERE id = ${id}`

    const list = await app.request("/widget/admin", { headers: { Authorization: `Bearer ${token}` } })
    const { widgets } = await list.json()
    const key = widgets.find((k: { id: string }) => k.id === id)
    expect(key.createdAt).toBe("2026-09-20T00:30:00.000Z")
    expect(z.coerce.date().parse(key.createdAt).getTime()).toBe(INSTANT.getTime())
  })
})

describe("stats days follow the viewer's timezone", () => {
  const email = faker.internet.email()
  let token: string
  let userId: string
  // 20:00 UTC three days ago: still that day in UTC and Los Angeles, already the next day in Tokyo.
  const seededAt = (() => {
    const at = new Date()
    at.setUTCHours(20, 0, 0, 0)
    at.setUTCDate(at.getUTCDate() - 3)
    return at
  })()

  const get = async (query: string) => {
    const res = await app.request(`/stats${query}`, { headers: { Authorization: `Bearer ${token}` } })
    return { status: res.status, body: (await res.json()) as UsageStatsResponse }
  }
  const startedOn = (body: UsageStatsResponse) => body.perDay.filter(day => day.started > 0).map(day => day.date)

  beforeAll(async () => {
    token = await signUpAndSignIn(email, "Zone Stats")
    userId = (await sql`SELECT id FROM "user" WHERE email = ${email.toLowerCase()}`)[0].id
    const id = await nasiStore(userId).createSession({
      persona: "default",
      model: "model-a",
      owner: null,
      title: "seed",
      session: { messages: [], telemetry: { steps: [], calls: {} } },
      events: []
    })
    await sql`UPDATE nasi_session SET created_at = ${seededAt}, updated_at = ${seededAt} WHERE id = ${id}`
  })

  afterAll(async () => {
    await sql`DELETE FROM "user" WHERE id = ${userId}`
  })

  test("the one session lands on the calendar day of whoever is looking", async () => {
    for (const zone of ZONES) {
      const { status, body } = await get(`?days=7&tz=${encodeURIComponent(zone)}`)
      expect(status).toBe(200)
      expect(body.timeZone).toBe(zone)
      expect(body.perDay).toHaveLength(7)
      expect(startedOn(body)).toEqual([dayIn(seededAt, zone)])
    }
    // Tokyo is ahead of UTC by enough to be the next day, which is the whole point.
    expect(dayIn(seededAt, "Asia/Tokyo")).not.toBe(dayIn(seededAt, "UTC"))
  })

  test("the last bucket is the viewer's today", async () => {
    for (const zone of ZONES) {
      const { body } = await get(`?days=3&tz=${encodeURIComponent(zone)}`)
      expect(body.perDay.at(-1)?.date).toBe(dayIn(new Date(), zone))
    }
  })

  test("without a timezone the days are UTC, as before", async () => {
    const { body } = await get("?days=7")
    expect(body.timeZone).toBe("UTC")
    expect(startedOn(body)).toEqual([dayIn(seededAt, "UTC")])
  })

  test("the session counts in the totals whichever zone asks", async () => {
    for (const zone of ZONES) {
      const { body } = await get(`?days=7&tz=${encodeURIComponent(zone)}`)
      expect(body.totals.sessions).toBe(1)
    }
  })

  test("rejects a timezone that is not an IANA name", async () => {
    // "+09:00" is valid for Intl but Postgres would read it as POSIX with the sign flipped, so it must not get through.
    for (const zone of ["Mars/Base", "+09:00", "", "UTC; DROP TABLE nasi_session"]) {
      const { status } = await get(`?tz=${encodeURIComponent(zone)}`)
      expect(status).toBe(400)
    }
  })
})
