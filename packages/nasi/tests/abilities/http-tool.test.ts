import { afterAll, beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import { type HttpToolAbility, HttpToolAbilitySchema } from "@kaja/schema/abilities"
import type * as z from "zod"

type AbilityInput = z.input<typeof HttpToolAbilitySchema>

import { approvalSummary, buildHttpRequest, checkHttpToolKey, createHttpTools } from "../../src/abilities/http-tool"
import { toolName } from "../../src/agent/tools"

const ability = (over: Partial<AbilityInput> = {}): HttpToolAbility =>
  HttpToolAbilitySchema.parse({
    name: "demo",
    description: "Demo API",
    baseUrl: "https://api.example.com/v2",
    tools: [
      {
        name: "get_item",
        description: "Get one item",
        path: "/items/{id}",
        parameters: { type: "object", properties: { id: { type: "string" }, fields: { type: "string" } } }
      },
      {
        name: "create_item",
        description: "Create an item",
        method: "POST",
        path: "/items",
        parameters: { type: "object", properties: { title: { type: "string" } } }
      }
    ],
    ...over
  })

test("the shipped open-meteo manifest is valid", async () => {
  const text = await Bun.file(join(import.meta.dir, "../../../../marketplace/tools/open-meteo.toml")).text()
  const parsed = HttpToolAbilitySchema.parse(Bun.TOML.parse(text))
  expect(parsed.tools.map(t => t.name)).toEqual(["weather_forecast"])
})

test("the shipped brave-search manifest sends the key as a header and the query as q", async () => {
  const text = await Bun.file(join(import.meta.dir, "../../../../marketplace/tools/brave-search.toml")).text()
  const parsed = HttpToolAbilitySchema.parse(Bun.TOML.parse(text))
  const def = parsed.tools[0]!
  expect(def.name).toBe("web_search")
  const request = buildHttpRequest(parsed, def, { q: "kaja ai", freshness: "pw" }, "brave-key")
  expect(request.url).toBe("https://api.search.brave.com/res/v1/llm/context?q=kaja+ai&freshness=pw")
  expect(request.headers["X-Subscription-Token"]).toBe("brave-key")
  expect(approvalSummary(parsed, def, { q: "kaja" })).not.toContain("brave-key")
})

test("schema rejects undeclared placeholders, bad names, duplicates and non-http base URLs", () => {
  const bad = HttpToolAbilitySchema.safeParse({
    name: "Bad Name",
    description: "x",
    baseUrl: "ftp://example.com",
    tools: [
      { name: "a b", description: "x", path: "/x/{id}" },
      { name: "dup", description: "x", path: "/y" },
      { name: "dup", description: "x", path: "no-slash" }
    ]
  })
  const paths = bad.error!.issues.map(issue => issue.path.join("."))
  expect(paths).toEqual(
    expect.arrayContaining(["name", "baseUrl", "tools.0.name", "tools.0.path", "tools.2.name", "tools.2.path"])
  )
})

test("fills path placeholders URL-encoded, so a value can't add segments or change the host", () => {
  const def = ability().tools[0]!
  expect(buildHttpRequest(ability(), def, { id: "../../admin" }).url).toBe(
    "https://api.example.com/v2/items/..%2F..%2Fadmin"
  )
  expect(new URL(buildHttpRequest(ability(), def, { id: "x@evil.com" }).url).host).toBe("api.example.com")
  expect(() => buildHttpRequest(ability(), def, {})).toThrow("{id}")
})

test("GET puts the other arguments in the query (arrays repeated), POST in a JSON body", () => {
  const [get, post] = ability().tools
  expect(buildHttpRequest(ability(), get!, { id: "1", fields: "a,b", tags: ["x", "y"], skip: null }).url).toBe(
    "https://api.example.com/v2/items/1?fields=a%2Cb&tags=x&tags=y"
  )
  const request = buildHttpRequest(ability(), post!, { title: "Hello" })
  expect(request.url).toBe("https://api.example.com/v2/items")
  expect(request.body).toBe('{"title":"Hello"}')
  expect(request.headers["Content-Type"]).toBe("application/json")
})

test("keeps a static query in the path and adds static headers", () => {
  const withQuery = ability({ headers: { Accept: "application/json" } })
  const def = { ...withQuery.tools[0]!, path: "/items/{id}?format=json" }
  const request = buildHttpRequest(withQuery, def, { id: "1" })
  expect(request.url).toBe("https://api.example.com/v2/items/1?format=json")
  expect(request.headers.Accept).toBe("application/json")
})

test("puts the key in a header (with prefix) or the query, and needs one when auth says so", () => {
  const header = ability({ auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " } })
  expect(buildHttpRequest(header, header.tools[0]!, { id: "1" }, "k1").headers.Authorization).toBe("Bearer k1")
  const query = ability({ auth: { type: "apiKey", in: "query", name: "api_key" } })
  expect(buildHttpRequest(query, query.tools[0]!, { id: "1" }, "k2").url).toContain("api_key=k2")
  expect(() => buildHttpRequest(query, query.tools[0]!, { id: "1" })).toThrow("no API key")
})

test("an optional key that isn't set adds nothing, and the summary shows no mask", () => {
  const optional = ability({ auth: { type: "apiKey", in: "query", name: "api_key", optional: true } })
  expect(buildHttpRequest(optional, optional.tools[0]!, { id: "1" }).url).toBe("https://api.example.com/v2/items/1")
  expect(approvalSummary(optional, optional.tools[1]!, { title: "Hi" }, false)).toBe(
    'POST https://api.example.com/v2/items {"title":"Hi"}'
  )
})

test("the approval summary shows method, URL and body, with the key masked", () => {
  const query = ability({ auth: { type: "apiKey", in: "query", name: "api_key" } })
  const summary = approvalSummary(query, query.tools[1]!, { title: "Hi" })
  expect(summary).toBe('POST https://api.example.com/v2/items?api_key=%E2%80%A2%E2%80%A2%E2%80%A2 {"title":"Hi"}')
})

test("only non-GET tools ask for approval", () => {
  const [get, post] = createHttpTools(ability())
  expect(toolName(get!)).toBe("get_item")
  expect(get!.approval).toBeUndefined()
  expect(post!.approval?.({ title: "x" })).toContain("POST https://api.example.com/v2/items")
})

let server: ReturnType<typeof Bun.serve>
let base: string

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/check")
        return new Response(null, { status: req.headers.get("x-key") === "good" ? 200 : 401 })
      if (url.pathname === "/echo")
        return Response.json({ key: req.headers.get("x-key"), q: url.searchParams.get("q") })
      if (url.pathname === "/missing") return new Response("nope", { status: 404, statusText: "Not Found" })
      if (url.pathname === "/big")
        return new Response("x".repeat(40_000), { headers: { "content-type": "text/plain" } })
      if (url.pathname === "/image")
        return new Response(new Uint8Array(10), { headers: { "content-type": "image/png" } })
      if (url.pathname === "/away") return Response.redirect("https://example.com/elsewhere", 302)
      return new Response("ok")
    }
  })
  base = `http://localhost:${server.port}`
})

afterAll(() => {
  server.stop(true)
})

function localAbility(path: string, auth: AbilityInput["auth"] = { type: "none" }) {
  return HttpToolAbilitySchema.parse({
    name: "local",
    description: "Local test API",
    baseUrl: base,
    auth,
    tools: [{ name: "call", description: "x", path, parameters: { type: "object", properties: {} } }]
  })
}

test("returns the status line and body, with the key masked even if the API echoes it", async () => {
  const [call] = createHttpTools(localAbility("/echo", { type: "apiKey", in: "header", name: "X-Key" }), {
    apiKey: "sekrit",
    allowPrivate: true
  })
  const text = await call!.execute({ q: "hi" })
  expect(text).toStartWith("HTTP 200")
  expect(text).toContain('"q":"hi"')
  expect(text).not.toContain("sekrit")
})

test("a non-2xx response comes back as text instead of failing the turn", async () => {
  const [call] = createHttpTools(localAbility("/missing"), { allowPrivate: true })
  expect(await call!.execute({})).toBe("HTTP 404 Not Found\n\nnope")
})

test("long bodies are cut and binary bodies are described", async () => {
  const [big] = createHttpTools(localAbility("/big"), { allowPrivate: true })
  const text = String(await big!.execute({}))
  expect(text).toContain("[cut: 40000 characters in total]")
  expect(text.length).toBeLessThan(33 * 1024)
  const [image] = createHttpTools(localAbility("/image"), { allowPrivate: true })
  expect(await image!.execute({})).toBe("HTTP 200 OK\n\n(image/png, 10 bytes, not shown)")
})

test("private hosts are blocked unless allowed, and cross-host redirects are refused", async () => {
  const [blocked] = createHttpTools(localAbility("/echo"))
  expect(await blocked!.execute({})).toStartWith("Request failed: Blocked non-public URL")
  const [away] = createHttpTools(localAbility("/away"), { allowPrivate: true })
  expect(await away!.execute({})).toStartWith("Request failed: Refused a redirect to another host")
})

test("checkHttpToolKey runs the manifest's check: works, rejected, or no check at all", async () => {
  const keyed = {
    ...localAbility("/echo", { type: "apiKey", in: "header", name: "X-Key" }),
    check: { method: "GET" as const, path: "/check" }
  }
  expect(await checkHttpToolKey(keyed, "good", { allowPrivate: true })).toEqual({ ok: true })
  expect(await checkHttpToolKey(keyed, "bad", { allowPrivate: true })).toEqual({ ok: false, reason: "HTTP 401" })
  expect(await checkHttpToolKey({ ...keyed, check: undefined }, "good", { allowPrivate: true })).toBeUndefined()
})

test("checkHttpToolKey never reaches a private host from the cloud, and keeps the key out of the reason", async () => {
  const keyed = HttpToolAbilitySchema.parse({
    ...localAbility("/echo", { type: "apiKey", in: "query", name: "key" }),
    check: { path: "/check" }
  })
  const result = await checkHttpToolKey(keyed, "sekrit-value")
  expect(result).toMatchObject({ ok: false })
  expect(result?.ok === false && result.reason).toStartWith("Blocked non-public URL")
  expect(JSON.stringify(result)).not.toContain("sekrit-value")
})
