import { describe, expect, it } from "bun:test"
import { getCity } from "./index"

const city = getCity("77.100.193.121")
console.log("XXXXXXX", JSON.stringify(city, null, 2))

describe.skip("getCity", () => {
  it("looks up 8.8.8.8", () => {
    const city = getCity("77.100.193.121")
    console.log("XXXXXXX", JSON.stringify(city, null, 2))
    expect(city).toBeDefined()
    expect(city?.traits.ipAddress).toBe("8.8.8.8")
  })

  it("looks up 0.0.0.0", () => {
    const city = getCity("0.0.0.0")
    expect(city).toBeUndefined()
  })
})
