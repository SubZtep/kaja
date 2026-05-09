import { describe, expect, it } from "bun:test"
import { getCity } from "./index"

describe("getCity", () => {
  it("looks up 8.8.8.8", () => {
    const city = getCity("8.8.8.8")
    expect(city).toBeDefined()
    expect(city?.traits.ipAddress).toBe("8.8.8.8")
  })

  it("looks up 0.0.0.0", () => {
    const city = getCity("0.0.0.0")
    expect(city).toBeUndefined()
  })
})
