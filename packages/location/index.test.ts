import { describe, expect, it } from "bun:test"
import { getCity } from "./index"

describe.skip("getCity", () => {
  let ip = Array.from({ length: 4 })
    .map(() => 8)
    .join(".")

  it(`looks up ${ip}`, () => {
    const city = getCity(ip)
    expect(city).toBeDefined()
    expect(city?.traits.ipAddress).toBe(ip)
  })

  ip = Array.from({ length: 4 })
    .map(() => 0)
    .join(".")

  it(`looks up ${ip}`, () => {
    const city = getCity(ip)
    expect(city).toBeUndefined()
  })
})
