import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { faker } from "@faker-js/faker"
import { SANDBOX_KEY_HEADER, SANDBOX_RELAY_KEY_HEADER } from "@kaja/schema/api"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { lookupGeo, setGeoLookupOverride } from "../../src/core/geo"
import {
  egressFor,
  mcpSandboxFor,
  NoSandboxError,
  pickSandbox,
  type SandboxKeys
} from "../../src/features/sandbox/registry"
import { closeRelays } from "../../src/features/sandbox/relay"
import { abilityService, sandboxService } from "../../src/services"
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

/** An MCP initialize request, the first a new server gets. */
const initialize: RequestInit = {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } }
  })
}

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
      expect((await pickSandbox(userA, ability))?.tunnel.id).toBe(own.id)
      expect(await pickSandbox(userA, "not-an-ability")).toBeUndefined()
      await own.close()
      expect(await pickSandbox(userA, ability)).toBeUndefined()
      expect((await settings(tokenA, { useShared: true })).status).toBe(200)
      expect(await pickSandbox(userA, ability)).toMatchObject({ tunnel: { id: theirs.id }, borrowed: true })
      // An ability that needs a trusted sandbox never goes to another person's.
      expect(await pickSandbox(userA, ability, { trust: "trusted" })).toBeUndefined()
      expect(await (await settings(tokenB, { share: false })).json()).toMatchObject({ share: false, useShared: false })
      expect(await pickSandbox(userA, ability)).toBeUndefined()
    } finally {
      await theirs.close()
      await settings(tokenA, { useShared: false })
      await settings(tokenB, { share: true })
    }
  }, 30_000)

  test("if the user's trusted-only abilities can't be looked up, the turn stays off other people's sandboxes", async () => {
    const theirs = await startSandbox({ apiUrl, abilities: [ability], key: await newKey(tokenB) })
    const lookup = spyOn(abilityService, "mcpAbilities").mockRejectedValue(new Error("database down"))
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      await settings(tokenA, { useShared: true })
      const res = await mcpSandboxFor(userA).fetch(`http://sandbox.invalid/mcp/${ability}`, initialize)
      expect(res.status).toBe(503)
      await res.text()
      expect(theirs.pool.size).toBe(0)
      expect(logged).toHaveBeenCalled()
    } finally {
      lookup.mockRestore()
      logged.mockRestore()
      await theirs.close()
      await settings(tokenA, { useShared: false })
    }
  }, 30_000)

  test("a full sandbox sends the turn to the next one, and a borrowed one forgets it when the turn ends", async () => {
    const warned = spyOn(console, "warn").mockImplementation(() => {})
    const own = await startSandbox({
      apiUrl,
      abilities: [ability],
      key: await newKey(tokenA),
      hasRoom: async () => false
    })
    const theirs = await startSandbox({ apiUrl, abilities: [ability], key: await newKey(tokenB) })
    try {
      await settings(tokenA, { useShared: true })
      const sandbox = mcpSandboxFor(userA)
      const res = await sandbox.fetch(`http://sandbox.invalid/mcp/${ability}`, initialize)
      expect(res.status).toBe(200)
      await res.text()
      expect(own.pool.counts.refusedMemory).toBe(1)
      expect(theirs.pool.size).toBe(1)
      await sandbox.close?.()
      await waitFor(async () => (theirs.pool.size === 0 ? true : undefined))
      expect(theirs.pool.counts.released).toBe(1)
    } finally {
      warned.mockRestore()
      await Promise.all([own.close(), theirs.close()])
      await settings(tokenA, { useShared: false })
    }
  }, 30_000)

  test("the user's own sandbox keeps their server warm after the turn", async () => {
    const own = await startSandbox({ apiUrl, abilities: [ability], key: await newKey(tokenA) })
    try {
      const sandbox = mcpSandboxFor(userA)
      const res = await sandbox.fetch(`http://sandbox.invalid/mcp/${ability}`, initialize)
      expect(res.status).toBe(200)
      await res.text()
      await sandbox.close?.()
      await Bun.sleep(300)
      expect(own.pool.size).toBe(1)
      expect(own.pool.counts.released).toBe(0)
    } finally {
      await own.close()
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

describe("load history", () => {
  test("each heartbeat is a sample, bucketed for the chart, and old ones are pruned", async () => {
    const sandbox = await startSandbox({ apiUrl, abilities: [ability] })
    try {
      await sandboxService.heartbeat(sandbox.id, { running: 1, load: 0.5, memoryUsed: 1000 })
      await Bun.sleep(5)
      await sandboxService.heartbeat(sandbox.id, { running: 3, load: 1.5, memoryUsed: 3000 })
      const samples = await sandboxService.samples(sandbox.id, 1)
      expect(samples).toHaveLength(1)
      expect(samples[0]).toMatchObject({ running: 3, load: 1, memoryUsed: 2000 })
      await pool.query("UPDATE sandbox_sample SET at = at - interval '8 days' WHERE sandbox_id = $1", [sandbox.id])
      expect(await sandboxService.pruneSamples(7 * 24 * 60 * 60 * 1000)).toBeGreaterThanOrEqual(2)
      expect(await sandboxService.samples(sandbox.id, 168)).toEqual([])
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

describe("egress", () => {
  /** A sandbox's sender that answers with `who` and records the URLs it was asked for. */
  const answering = (who: string, urls: string[]) => async (request: Request) => {
    urls.push(request.url)
    return new Response(who)
  }

  test("fetch_url goes out through a sandbox that takes fetch frames, never from the API; with none it fails", async () => {
    const urls: string[] = []
    const old = await startSandbox({ apiUrl, abilities: [], key: await newKey(tokenA), fetch: null })
    try {
      await expect(egressFor(userA)()("https://example.com/")).rejects.toBeInstanceOf(NoSandboxError)
    } finally {
      await old.close()
    }
    const own = await startSandbox({ apiUrl, abilities: [], key: await newKey(tokenA), fetch: answering("own", urls) })
    try {
      const res = await egressFor(userA)()("https://example.com/page", { method: "GET" })
      expect(await res.text()).toBe("own")
      expect(urls).toEqual(["https://example.com/page"])
    } finally {
      await own.close()
    }
  }, 30_000)

  test("an ability's requests, which may carry a key, go only through the official sandbox", async () => {
    const ownUrls: string[] = []
    const officialUrls: string[] = []
    const own = await startSandbox({
      apiUrl,
      abilities: [],
      key: await newKey(tokenA),
      fetch: answering("own", ownUrls)
    })
    const systemKey = env.SANDBOX_SYSTEM_KEY
    env.SANDBOX_SYSTEM_KEY = `system-${tag}`
    try {
      await expect(egressFor(userA)("web-search")("https://api.example.com/search")).rejects.toBeInstanceOf(
        NoSandboxError
      )
      const official = await startSandbox({
        apiUrl,
        abilities: [],
        key: `system-${tag}`,
        fetch: answering("official", officialUrls)
      })
      try {
        const egress = egressFor(userA)
        expect(await (await egress("web-search")("https://api.example.com/search")).text()).toBe("official")
        expect(await (await egress()("https://example.com/")).text()).toBe("own")
        expect(officialUrls).toEqual(["https://api.example.com/search"])
        expect(ownUrls).toEqual(["https://example.com/"])
      } finally {
        await official.close()
      }
    } finally {
      env.SANDBOX_SYSTEM_KEY = systemKey
      await own.close()
    }
  }, 30_000)

  test("an ability's key decides where its calls go: the user's own key to their own sandbox, a server-wide one never", async () => {
    const urls: string[] = []
    const keys: SandboxKeys = name =>
      name === "mine" ? { value: "k1", own: true } : name === "server" ? { value: "k2", own: false } : undefined
    const own = await startSandbox({ apiUrl, abilities: [], key: await newKey(tokenA), fetch: answering("own", urls) })
    try {
      const egress = egressFor(userA, keys)
      expect(await (await egress("mine")("https://api.example.com/")).text()).toBe("own")
      expect(await (await egress("keyless")("https://open.example.com/")).text()).toBe("own")
      await expect(egress("server")("https://api.example.com/")).rejects.toBeInstanceOf(NoSandboxError)
    } finally {
      await own.close()
    }
    const theirs = await startSandbox({
      apiUrl,
      abilities: [],
      key: await newKey(tokenB),
      fetch: answering("theirs", urls)
    })
    try {
      await settings(tokenA, { useShared: true })
      const egress = egressFor(userA, keys)
      expect(await (await egress("keyless")("https://open.example.com/")).text()).toBe("theirs")
      await expect(egress("mine")("https://api.example.com/")).rejects.toBeInstanceOf(NoSandboxError)
    } finally {
      await settings(tokenA, { useShared: false })
      await theirs.close()
    }
  }, 30_000)

  test("a keyed stdio server gets the user's key with each request, and only on a sandbox that key may go to", async () => {
    const keyedAbility = `keyed-${tag}`
    const own = await startSandbox({
      apiUrl,
      abilities: [keyedAbility],
      keyed: [keyedAbility],
      key: await newKey(tokenA)
    })
    try {
      const url = `http://sandbox.invalid/mcp/${keyedAbility}`
      expect((await mcpSandboxFor(userA).fetch(url, initialize)).status).toBe(400)
      expect((await mcpSandboxFor(userA, () => ({ value: "k1", own: true })).fetch(url, initialize)).status).toBe(200)
      const server = mcpSandboxFor(userA, () => ({ value: "k2", own: false }))
      expect((await server.fetch(url, initialize)).status).toBe(503)
    } finally {
      await own.close()
    }
  }, 30_000)
})

describe("relay", () => {
  const relay = (name: string, init: RequestInit, token?: string, key?: string) =>
    app.request(`/sandbox/relay/mcp/${name}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { [SANDBOX_RELAY_KEY_HEADER]: key } : {})
      }
    })

  afterAll(closeRelays)

  test("a signed-in local client reaches its stdio ability on a sandbox, one MCP session across requests", async () => {
    const relayed = `relayed-${tag}`
    const own = await startSandbox({ apiUrl, abilities: [relayed], key: await newKey(tokenA) })
    try {
      expect((await relay(relayed, initialize)).status).toBe(401)
      const started = await relay(relayed, initialize, tokenA)
      expect(started.status).toBe(200)
      const session = started.headers.get("mcp-session-id")
      expect(session).toBeTruthy()
      await started.body?.cancel()

      const listed = await relay(
        relayed,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "mcp-session-id": session!,
            "mcp-protocol-version": "2025-06-18"
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
        },
        tokenA
      )
      expect(listed.status).toBe(200)
      expect(await listed.text()).toContain('"count"')
    } finally {
      await own.close()
    }
  }, 30_000)

  test("a key the client sends is the user's own: it goes to their own sandbox with the request", async () => {
    const keyedRelayed = `keyed-relayed-${tag}`
    const own = await startSandbox({
      apiUrl,
      abilities: [keyedRelayed],
      keyed: [keyedRelayed],
      key: await newKey(tokenA)
    })
    try {
      await closeRelays()
      expect((await relay(keyedRelayed, initialize, tokenA)).status).toBe(400)
      const started = await relay(keyedRelayed, initialize, tokenA, "k1")
      expect(started.status).toBe(200)
      await started.body?.cancel()
    } finally {
      await own.close()
    }
  }, 30_000)

  test("with no sandbox online the client gets a 503", async () => {
    await closeRelays()
    expect((await relay(`nowhere-${tag}`, initialize, tokenB)).status).toBe(503)
  })
})
