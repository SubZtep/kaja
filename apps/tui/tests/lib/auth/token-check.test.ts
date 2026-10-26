import { expect, test } from "bun:test"
import { isTokenRejected } from "../../../src/lib/auth/token-check"

const answering = (respond: () => Response | Promise<Response>) => (async () => respond()) as unknown as typeof fetch

test("a 401 means the token is expired or revoked", async () => {
  expect(
    await isTokenRejected(
      "https://api.kaja.io",
      "tok",
      answering(() => new Response(null, { status: 401 }))
    )
  ).toBe(true)
})

test("a working token, a server error or no network keeps the token", async () => {
  expect(
    await isTokenRejected(
      "https://api.kaja.io",
      "tok",
      answering(() => Response.json({}))
    )
  ).toBe(false)
  expect(
    await isTokenRejected(
      "https://api.kaja.io",
      "tok",
      answering(() => new Response(null, { status: 503 }))
    )
  ).toBe(false)
  expect(
    await isTokenRejected(
      "https://api.kaja.io",
      "tok",
      answering(() => Promise.reject(new TypeError("fetch failed")))
    )
  ).toBe(false)
})

test("the check sends the token to the API's info route", async () => {
  let seen: { url: string; auth: string | null } | undefined
  const fetchImpl = (async (url: URL, init?: RequestInit) => {
    seen = { url: url.toString(), auth: new Headers(init?.headers).get("authorization") }
    return Response.json({})
  }) as unknown as typeof fetch
  await isTokenRejected("https://api.kaja.io", "tok", fetchImpl)
  expect(seen).toEqual({ url: "https://api.kaja.io/nasi/info", auth: "Bearer tok" })
})
