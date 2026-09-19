import { afterAll, beforeAll, expect, test } from "bun:test"
import { fetchPublicHttp, UnsafeUrlError } from "../../src/security/ssrf"

let server: ReturnType<typeof Bun.serve>
let base: string

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/see-other") return new Response(null, { status: 303, headers: { location: "/echo" } })
      if (url.pathname === "/temporary") return new Response(null, { status: 307, headers: { location: "/echo" } })
      return Response.json({ method: req.method, body: await req.text(), header: req.headers.get("x-test") })
    }
  })
  base = `http://localhost:${server.port}`
})

afterAll(() => {
  server.stop(true)
})

test("sends the method, headers and body", async () => {
  const res = await fetchPublicHttp(`${base}/echo`, {
    method: "POST",
    headers: { "x-test": "1" },
    body: "hello",
    allowPrivate: true
  })
  expect(await res.json()).toEqual({ method: "POST", body: "hello", header: "1" })
})

test("303 turns a POST into a body-less GET; 307 repeats it", async () => {
  const seeOther = await fetchPublicHttp(`${base}/see-other`, { method: "POST", body: "x", allowPrivate: true })
  expect(await seeOther.json()).toMatchObject({ method: "GET", body: "" })
  const temporary = await fetchPublicHttp(`${base}/temporary`, { method: "POST", body: "x", allowPrivate: true })
  expect(await temporary.json()).toMatchObject({ method: "POST", body: "x" })
})

test("allowPrivate still refuses non-http URLs; without it localhost is blocked", async () => {
  await expect(fetchPublicHttp("file:///etc/passwd", { allowPrivate: true })).rejects.toThrow(UnsafeUrlError)
  await expect(fetchPublicHttp(`${base}/echo`)).rejects.toThrow(UnsafeUrlError)
})
