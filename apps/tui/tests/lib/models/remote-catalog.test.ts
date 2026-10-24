import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { PUBLIC_CATALOG_VERSION } from "@kaja/schema/api"
import { CATALOG, catalogProvider, setCatalog } from "../../../lib/models/catalog"
import { refreshCatalog } from "../../../lib/models/remote-catalog"
import { getPaths } from "../../../lib/paths"

const provider = (id: string, base_url = "https://api.example.com/v1", kind: "hosted" | "self-hosted" = "hosted") => ({
  id,
  name: id,
  kind,
  base_url,
  note: null,
  doc: null,
  models: [
    {
      model: `${id}-model`,
      name: null,
      tasks: ["chat" as const],
      default_tasks: ["chat" as const],
      context_window: null,
      images: true
    }
  ]
})
const catalogOf = (...providers: ReturnType<typeof provider>[]) => ({ version: PUBLIC_CATALOG_VERSION, providers })
const ids = () => CATALOG.map(p => p.id)

// A stand-in API: each test sets what /config/catalog answers, and sees what was asked.
let answer: (req: Request) => Response | Promise<Response> = () => new Response(null, { status: 500 })
const server = Bun.serve({ port: 0, fetch: req => answer(req) })
const previousUrl = process.env.KAJA_API_URL

beforeEach(() => {
  process.env.KAJA_API_URL = `http://localhost:${server.port}`
  rmSync(join(getPaths().cache, "catalog.json"), { force: true })
})
afterEach(() => {
  setCatalog()
})
afterAll(() => {
  server.stop(true)
  if (previousUrl === undefined) delete process.env.KAJA_API_URL
  else process.env.KAJA_API_URL = previousUrl
})

test("the API's catalog becomes the wizard's", async () => {
  answer = () => Response.json(catalogOf(provider("fresh")))
  expect(await refreshCatalog()).toBe(true)
  expect(ids()).toEqual(["fresh"])
  expect(catalogProvider("fresh")?.baseUrl).toBe("https://api.example.com/v1")
})

test("a self-hosted provider may be plain http", async () => {
  answer = () =>
    Response.json(catalogOf(provider("cloud"), provider("local", "http://localhost:11434/v1", "self-hosted")))
  expect(await refreshCatalog()).toBe(true)
  expect(ids()).toEqual(["cloud", "local"])
})

test.each([
  ["a hosted provider on plain http", () => Response.json(catalogOf(provider("leaky", "http://api.example.com/v1")))],
  ["a version this build doesn't read", () => Response.json({ ...catalogOf(provider("x")), version: 99 })],
  ["an error status", () => new Response("nope", { status: 503 })],
  ["a body that isn't JSON", () => new Response("<html>")],
  ["a catalog that fails validation", () => Response.json({ version: PUBLIC_CATALOG_VERSION })]
])("%s leaves no catalog when none was cached", async (_name, respond) => {
  setCatalog(catalogOf(provider("stale")))
  answer = respond
  expect(await refreshCatalog()).toBe(false)
  expect(ids()).toEqual([])
})

test("a server that never answers is given up on", async () => {
  answer = () => new Promise<Response>(() => {})
  expect(await refreshCatalog(50)).toBe(false)
})

test("the last good catalog is cached: a 304 and an unreachable server both use it", async () => {
  answer = () => Response.json(catalogOf(provider("kept")), { headers: { ETag: '"v1"' } })
  expect(await refreshCatalog()).toBe(true)

  let sent: string | null | undefined
  answer = req => {
    sent = req.headers.get("if-none-match")
    return new Response(null, { status: 304 })
  }
  setCatalog()
  expect(await refreshCatalog()).toBe(true)
  expect(sent).toBe('"v1"')
  expect(ids()).toEqual(["kept"])

  setCatalog()
  process.env.KAJA_API_URL = "http://localhost:1"
  expect(await refreshCatalog()).toBe(true)
  expect(ids()).toEqual(["kept"])
})
