import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { clientIp } from "../../src/core/rate-limit"

const app = new Hono().get("/", c => c.text(clientIp(c)))
const ipFor = async (headers: Record<string, string>) => (await app.request("/", { headers })).text()

describe("clientIp", () => {
  test("the first X-Forwarded-For entry is the visitor (Disco's Caddy sets the header itself)", async () => {
    expect(await ipFor({ "x-forwarded-for": "203.0.113.7" })).toBe("203.0.113.7")
    expect(await ipFor({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.2" })).toBe("203.0.113.7")
  })

  test("headers a client can set on its own are never trusted as the fallback", async () => {
    expect(await ipFor({ "cf-connecting-ip": "198.51.100.1", "x-real-ip": "198.51.100.2" })).toBe("unknown")
  })
})
