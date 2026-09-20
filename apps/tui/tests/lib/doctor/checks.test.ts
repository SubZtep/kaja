import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test"
import { HttpToolAbilitySchema } from "@kaja/schema/abilities"
import type { CliResolvedModel } from "@kaja/schema/config"
import { checkAbilityKey, checkProvider, checkTelegramToken, checkWebSearchKey } from "../../../lib/doctor/checks"

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

const chatModel: CliResolvedModel = {
  id: "chat",
  model: "llama3.2:1b",
  task: "chat",
  baseUrl: "http://localhost:11434/v1",
  provider: "ollama"
}

test("a rejected key is a credential failure, an unreachable server is not", async () => {
  // Only the first is worth asking the user to retype — the wizard and doctor key off this.
  mockFetch(() => Response.json({ error: { message: "Incorrect API key" } }, { status: 401 }))
  expect(await checkProvider(chatModel, "bad-key")).toMatchObject({ ok: false, kind: "credential" })

  mockFetch(() => {
    throw new Error("Connection refused")
  })
  expect(await checkProvider(chatModel, undefined)).toMatchObject({ ok: false, kind: "unreachable" })
})

test("a model the provider doesn't have is unreachable, not a key problem", async () => {
  mockFetch(() => Response.json({ error: { message: "model not found" } }, { status: 404 }))
  expect(await checkProvider(chatModel, "fine-key")).toMatchObject({ ok: false, kind: "unreachable" })
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

test("an ability key is tested with the manifest's check request; no check means untestable", async () => {
  const ability = HttpToolAbilitySchema.parse({
    name: "local",
    description: "x",
    baseUrl: `http://localhost:${server.port}`,
    auth: { type: "apiKey", in: "header", name: "X-Key" },
    check: { path: "/me" },
    tools: [{ name: "t", description: "x", path: "/t" }]
  })
  expect(await checkAbilityKey(ability, "good")).toEqual({ ok: true })
  expect(await checkAbilityKey(ability, "bad")).toEqual({ ok: false, reason: "HTTP 401" })
  expect(await checkAbilityKey({ ...ability, check: undefined }, "good")).toBeUndefined()
})
