import { describe, expect, it } from "bun:test"
import { getGeoLocation } from "./index"

const TEST_PUBLIC_DNS_IP = "8.8.8.8"

describe("getGeoLocation", () => {
  it("looks up a public DNS IP address", async () => {
    const location = await getGeoLocation(TEST_PUBLIC_DNS_IP)
    expect(location?.location).toBeDefined()
    expect(location?.country?.geonameId).toBe(6252001) // United States
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
