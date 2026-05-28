import { describe, expect, it } from "bun:test"
import { getGeoLocation } from "./index"

describe.skip("getGeoLocation", () => {
  it("looks up 8.8.8.8", async () => {
    const location = await getGeoLocation("8.8.8.8")
    expect(location).toBeDefined()
    if (location) {
      expect(location.country).toBeDefined()
      expect(location.location).toBeDefined()
    }
  })

  it("returns undefined for 0.0.0.0", async () => {
    const location = await getGeoLocation("0.0.0.0")
    expect(location).toBeUndefined()
  })

  it("returns undefined for invalid IP", async () => {
    const location = await getGeoLocation("invalid-ip")
    expect(location).toBeUndefined()
  })
})
