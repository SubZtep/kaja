import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test"
import { HttpToolPackageSchema } from "@kaja/schema/packages"
import { checkLocationKey, checkPackageKey, checkTelegramToken, checkWebSearchKey } from "../../../lib/doctor/checks"

let fetchSpy: ReturnType<typeof spyOn> | undefined

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input instanceof Request ? input.url : input), init)) as unknown as typeof fetch)
}

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
})

test("Telegram: getMe 200 is ok; an error shows Telegram's description, never the token", async () => {
  const urls: string[] = []
  mockFetch(url => {
    urls.push(url)
    return url.includes("good")
      ? Response.json({ ok: true })
      : Response.json({ ok: false, description: "Unauthorized" }, { status: 401 })
  })
  expect(await checkTelegramToken("good-token")).toEqual({ ok: true })
  expect(await checkTelegramToken("bad-token")).toEqual({ ok: false, reason: "HTTP 401: Unauthorized" })
  expect(urls[0]).toBe("https://api.telegram.org/botgood-token/getMe")
})

test("a network error is reported with the secret masked", async () => {
  mockFetch(url => {
    throw new Error(`connect failed for ${url}`)
  })
  const result = await checkTelegramToken("s3cret")
  expect(result.ok).toBe(false)
  expect(JSON.stringify(result)).not.toContain("s3cret")
})

test("web search sends the key as X-Subscription-Token", async () => {
  mockFetch((_url, init) =>
    new Headers(init?.headers).get("X-Subscription-Token") === "good"
      ? Response.json({})
      : new Response("", { status: 401 })
  )
  expect(await checkWebSearchKey("good")).toEqual({ ok: true })
  expect(await checkWebSearchKey("bad")).toEqual({ ok: false, reason: "HTTP 401" })
})

test("location does a real lookup with the key each time (no cached result)", async () => {
  const keys: (string | null)[] = []
  mockFetch((url, init) => {
    if (url.includes("ipify")) return new Response("1.2.3.4")
    keys.push(new Headers(init?.headers).get("X-API-Key"))
    return keys.length === 1 ? Response.json({ city: {} }) : new Response("no", { status: 403 })
  })
  expect(await checkLocationKey("https://geo.example.com", "first")).toEqual({ ok: true })
  expect((await checkLocationKey("https://geo.example.com", "second")).ok).toBe(false)
  expect(keys).toEqual(["first", "second"])
})

let server: ReturnType<typeof Bun.serve>

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: req => (req.headers.get("x-key") === "good" ? new Response("ok") : new Response("no", { status: 401 }))
  })
})

afterAll(() => {
  server.stop(true)
})

test("a package key is tested with the manifest's check request; no check means untestable", async () => {
  const pkg = HttpToolPackageSchema.parse({
    name: "local",
    description: "x",
    baseUrl: `http://localhost:${server.port}`,
    auth: { type: "apiKey", in: "header", name: "X-Key" },
    check: { path: "/me" },
    tools: [{ name: "t", description: "x", path: "/t" }]
  })
  expect(await checkPackageKey(pkg, "good")).toEqual({ ok: true })
  expect(await checkPackageKey(pkg, "bad")).toEqual({ ok: false, reason: "HTTP 401" })
  expect(await checkPackageKey({ ...pkg, check: undefined }, "good")).toBeUndefined()
})
