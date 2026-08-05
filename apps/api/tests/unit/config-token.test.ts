import { describe, expect, test } from "bun:test"
import { isValidConfigToken } from "../../src/features/config"

describe("isValidConfigToken", () => {
  test("fails closed when token is missing or empty", () => {
    expect(isValidConfigToken("Bearer secret", undefined)).toBe(false)
    expect(isValidConfigToken("Bearer secret", null)).toBe(false)
    expect(isValidConfigToken("Bearer secret", "")).toBe(false)
    expect(isValidConfigToken("Bearer ", "")).toBe(false)
  })

  test("rejects missing or wrong Authorization header", () => {
    expect(isValidConfigToken(undefined, "secret")).toBe(false)
    expect(isValidConfigToken(null, "secret")).toBe(false)
    expect(isValidConfigToken("secret", "secret")).toBe(false)
    expect(isValidConfigToken("Bearer wrong", "secret")).toBe(false)
    expect(isValidConfigToken("Basic secret", "secret")).toBe(false)
  })

  test("accepts exact Bearer match", () => {
    expect(isValidConfigToken("Bearer secret", "secret")).toBe(true)
    expect(isValidConfigToken("Bearer a-long-token-value", "a-long-token-value")).toBe(true)
  })
})
