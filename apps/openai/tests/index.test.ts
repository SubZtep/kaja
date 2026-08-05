import { describe, expect, test } from "bun:test"
import { isAuthorized } from "../index"

describe("isAuthorized", () => {
  test("rejects when Authorization header is missing or wrong", () => {
    expect(isAuthorized(new Request("http://x", { headers: {} }))).toBe(false)
    expect(isAuthorized(new Request("http://x", { headers: { authorization: "Bearer wrong" } }))).toBe(false)
  })

  test("accepts a matching Bearer token", () => {
    const token = process.env.CONFIG_API_TOKEN
    expect(token).toBeTruthy()
    expect(isAuthorized(new Request("http://x", { headers: { authorization: `Bearer ${token}` } }))).toBe(true)
  })
})
