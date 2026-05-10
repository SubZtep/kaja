import { describe, expect, it } from "bun:test"
import { getCity } from "./index"

describe.skip("getCity", () => {
  it("looks up 8.8.8.8", () => {
    const city = getCity(
      Array.from({ length: 4 })
        .map(() => 8)
        .join(".")
    )
    expect(city).toBeDefined()
    expect(city?.traits.ipAddress).toBe("8.8.8.8")
  })

  it("looks up 0.0.0.0", () => {
    const city = getCity(
      Array.from({ length: 4 })
        .map(() => 0)
        .join(".")
    )
    expect(city).toBeUndefined()
  })
})
