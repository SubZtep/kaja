import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
import { CATALOG_VERSION } from "@kaja/schema/config"
import { CATALOG, catalogProvider, setCatalog } from "../../../lib/models/catalog"
import { refreshCatalog } from "../../../lib/models/remote-catalog"

const provider = (id: string, base_url = "https://api.example.com/v1", kind = "hosted") => ({
  id,
  name: id,
  kind,
  base_url,
  models: [{ task: "chat", model: `${id}-model` }]
})
const catalogOf = (...providers: ReturnType<typeof provider>[]) => ({
  providers,
  examples: [{ file: "models.default.toml", providers: [providers[0]!.id] }]
})

// A stand-in API: each test sets what /config/catalog answers.
let answer: () => Response | Promise<Response> = () => new Response(null, { status: 500 })
const server = Bun.serve({ port: 0, fetch: () => answer() })
const previousUrl = process.env.KAJA_API_URL

beforeEach(() => {
  process.env.KAJA_API_URL = `http://localhost:${server.port}`
})
afterEach(() => {
  setCatalog()
})
afterAll(() => {
  server.stop(true)
  if (previousUrl === undefined) delete process.env.KAJA_API_URL
  else process.env.KAJA_API_URL = previousUrl
})

test("the API's catalog replaces the bundled one", async () => {
  answer = () => Response.json({ version: CATALOG_VERSION, catalog: catalogOf(provider("fresh")) })
  expect(await refreshCatalog()).toBe(true)
  expect(CATALOG.map(p => p.id)).toEqual(["fresh"])
  expect(catalogProvider("fresh")?.baseUrl).toBe("https://api.example.com/v1")
})

test("a self-hosted provider may be plain http", async () => {
  answer = () =>
    Response.json({
      version: CATALOG_VERSION,
      catalog: catalogOf(provider("cloud"), provider("local", "http://localhost:11434/v1", "self-hosted"))
    })
  expect(await refreshCatalog()).toBe(true)
  expect(CATALOG.map(p => p.id)).toEqual(["cloud", "local"])
})

test("a hosted provider on plain http keeps the bundled catalog", async () => {
  const bundled = CATALOG.map(p => p.id)
  answer = () =>
    Response.json({ version: CATALOG_VERSION, catalog: catalogOf(provider("leaky", "http://api.example.com/v1")) })
  expect(await refreshCatalog()).toBe(false)
  expect(CATALOG.map(p => p.id)).toEqual(bundled)
})

test("a version this build doesn't read keeps the bundled catalog", async () => {
  const bundled = CATALOG.map(p => p.id)
  answer = () => Response.json({ version: CATALOG_VERSION + 1, catalog: catalogOf(provider("future")) })
  expect(await refreshCatalog()).toBe(false)
  expect(CATALOG.map(p => p.id)).toEqual(bundled)
})

test.each([
  ["an error status", () => new Response("nope", { status: 503 })],
  ["a body that isn't JSON", () => new Response("<html>")],
  ["a catalog that fails validation", () => Response.json({ version: CATALOG_VERSION, catalog: { providers: [] } })]
])("%s keeps the bundled catalog", async (_name, respond) => {
  const bundled = CATALOG.map(p => p.id)
  answer = respond
  expect(await refreshCatalog()).toBe(false)
  expect(CATALOG.map(p => p.id)).toEqual(bundled)
})

test("a server that never answers is given up on", async () => {
  const bundled = CATALOG.map(p => p.id)
  answer = () => new Promise<Response>(() => {})
  expect(await refreshCatalog(50)).toBe(false)
  expect(CATALOG.map(p => p.id)).toEqual(bundled)
})

test("an unreachable server keeps the bundled catalog", async () => {
  const bundled = CATALOG.map(p => p.id)
  process.env.KAJA_API_URL = "http://localhost:1"
  expect(await refreshCatalog()).toBe(false)
  expect(CATALOG.map(p => p.id)).toEqual(bundled)
})
