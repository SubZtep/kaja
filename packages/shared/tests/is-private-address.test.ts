import { describe, expect, test } from "bun:test"
import { isPrivateAddress } from "../index"

describe("isPrivateAddress", () => {
  test("flags IPv4 loopback, link-local, and RFC1918 ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true)
    expect(isPrivateAddress("169.254.169.254")).toBe(true)
    expect(isPrivateAddress("10.0.0.5")).toBe(true)
    expect(isPrivateAddress("192.168.1.1")).toBe(true)
  })

  test("accepts a public IPv4 address", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
  })

  test("flags IPv6 loopback, link-local, and unique-local ranges", () => {
    expect(isPrivateAddress("::1")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
    expect(isPrivateAddress("fd00::1")).toBe(true)
  })

  test("accepts a public IPv6 address", () => {
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false)
  })
})
