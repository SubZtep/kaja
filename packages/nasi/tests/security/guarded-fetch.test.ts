import { afterEach, expect, test } from "bun:test"
import { createGuardedFetch, ProxyUnavailableError, UnsafeUrlError } from "../../src/security/ssrf"

// A proxy is set in every case, so the DNS check is left to it and the fake hosts below need no real DNS.
const PROXY = "http://proxy.test:3128"
const realFetch = globalThis.fetch
let calls: { url: string; method?: string; body?: unknown; proxy?: string; redirect?: string }[] = []

/** Answers requests from `routes` (path → response) and records them. */
function fakeServer(routes: Record<string, () => Response>) {
  calls = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit & { proxy?: string }) => {
    const url = new URL(String(input))
    calls.push({
      url: url.toString(),
      method: init?.method,
      body: init?.body,
      proxy: init?.proxy,
      redirect: init?.redirect
    })
    return routes[url.pathname]?.() ?? new Response("not found", { status: 404 })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

test("refuses private and non-http addresses before sending anything", async () => {
  fakeServer({})
  const guarded = createGuardedFetch({ proxy: PROXY })
  await expect(guarded("http://127.0.0.1:9/mcp")).rejects.toBeInstanceOf(UnsafeUrlError)
  await expect(guarded("http://localhost/mcp")).rejects.toBeInstanceOf(UnsafeUrlError)
  await expect(guarded("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError)
  expect(calls).toEqual([])
})

test("follows a same-origin redirect itself, through the proxy, and refuses one to another host", async () => {
  fakeServer({
    "/old": () => new Response(null, { status: 307, headers: { location: "/new" } }),
    "/new": () => new Response("here"),
    "/away": () => new Response(null, { status: 302, headers: { location: "https://other.example.test/x" } }),
    "/inside": () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } })
  })
  const guarded = createGuardedFetch({ proxy: PROXY })

  const res = await guarded("https://mcp.example.test/old", { method: "POST", body: "{}" })
  expect(await res.text()).toBe("here")
  expect(calls.map(call => [call.url, call.method, call.proxy, call.redirect])).toEqual([
    ["https://mcp.example.test/old", "POST", PROXY, "manual"],
    ["https://mcp.example.test/new", "POST", PROXY, "manual"]
  ])

  await expect(guarded("https://mcp.example.test/away")).rejects.toThrow("Refused a redirect to another host")
  await expect(guarded("https://mcp.example.test/inside")).rejects.toThrow("Refused a redirect to another host")
})

test("a 303 turns a POST into a body-less GET", async () => {
  fakeServer({
    "/submit": () => new Response(null, { status: 303, headers: { location: "/result" } }),
    "/result": () => new Response("done")
  })
  await createGuardedFetch({ proxy: PROXY })("https://mcp.example.test/submit", { method: "POST", body: "{}" })
  expect(calls[1]).toMatchObject({ url: "https://mcp.example.test/result", method: "GET", body: undefined })
})

test("hands back a streaming body straight away instead of buffering it", async () => {
  let push: ((text: string) => void) | undefined
  fakeServer({
    "/events": () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            push = text => controller.enqueue(new TextEncoder().encode(text))
          }
        }),
        { headers: { "content-type": "text/event-stream" } }
      )
  })
  const res = await createGuardedFetch({ proxy: PROXY })("https://mcp.example.test/events")
  const reader = res.body!.getReader()
  push!("data: one\n\n")
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: one\n\n")
  await reader.cancel()
})

test("a proxy that can't be reached fails closed instead of going direct", async () => {
  calls = []
  globalThis.fetch = (async () => {
    throw new Error("connection refused")
  }) as unknown as typeof fetch
  await expect(createGuardedFetch({ proxy: PROXY })("https://mcp.example.test/mcp")).rejects.toBeInstanceOf(
    ProxyUnavailableError
  )
})

test("a trusted origin (the MCP sandbox) goes direct, while its private neighbours stay refused", async () => {
  fakeServer({ "/mcp/demo": () => new Response("sandbox") })
  const guarded = createGuardedFetch({ proxy: PROXY, trustedOrigins: ["http://localhost:3002"] })
  expect(await (await guarded("http://localhost:3002/mcp/demo")).text()).toBe("sandbox")
  expect(calls.map(call => [call.url, call.proxy])).toEqual([["http://localhost:3002/mcp/demo", undefined]])
  await expect(guarded("http://localhost:3003/mcp/demo")).rejects.toBeInstanceOf(UnsafeUrlError)
})
