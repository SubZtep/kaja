import { describe, expect, test } from "bun:test"
import { resolveApiKey } from "../index"

describe("resolveApiKey", () => {
  test("uses the DB-resolved provider key when no zen key is forwarded", () => {
    const req = new Request("http://x", { headers: {} })
    expect(resolveApiKey(req, { apiKey: "db-key" })).toBe("db-key")
  })

  test("prefers a forwarded zen key over the DB-resolved provider key", () => {
    const req = new Request("http://x", { headers: { "x-kaja-zen-key": "sk-zen" } })
    expect(resolveApiKey(req, { apiKey: "db-key" })).toBe("sk-zen")
  })

  test("ignores a blank zen key header", () => {
    const req = new Request("http://x", { headers: { "x-kaja-zen-key": "   " } })
    expect(resolveApiKey(req, { apiKey: "db-key" })).toBe("db-key")
  })

  test("returns null when neither a zen key nor a provider key is available", () => {
    const req = new Request("http://x", { headers: {} })
    expect(resolveApiKey(req, { apiKey: null })).toBeNull()
  })
})
