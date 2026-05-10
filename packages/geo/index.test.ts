import { describe, expect, it } from "bun:test"
import { getGeoLocation } from "./index"

describe.skip("getGeoLocation", () => {
  let ip = Array.from({ length: 4 })
    .map(() => 8)
    .join(".")

  it(`looks up ${ip}`, () => {
    const city = getGeoLocation(ip)
    expect(city).toBeDefined()
  })

  ip = Array.from({ length: 4 })
    .map(() => 0)
    .join(".")

  it(`looks up ${ip}`, () => {
    const city = getGeoLocation(ip)
    expect(city).toBeUndefined()
  })
})
