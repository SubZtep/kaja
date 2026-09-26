import { describe, expect, test } from "bun:test"
import { isPrivateAddress } from "../index"

describe("isPrivateAddress", () => {
  test("flags IPv4 loopback, link-local, and RFC1918 ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true)
    expect(isPrivateAddress("169.254.169.254")).toBe(true)
    expect(isPrivateAddress("10.0.0.5")).toBe(true)
    expect(isPrivateAddress("192.168.1.1")).toBe(true)
  })

  test("flags 0.0.0.0/8 (reaches loopback on Linux), multicast and reserved IPv4", () => {
    expect(isPrivateAddress("0.0.0.0")).toBe(true)
    expect(isPrivateAddress("0.1.2.3")).toBe(true)
    expect(isPrivateAddress("224.0.0.1")).toBe(true)
    expect(isPrivateAddress("255.255.255.255")).toBe(true)
    expect(isPrivateAddress("223.255.255.255")).toBe(false)
  })

  test("accepts a public IPv4 address", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
  })

  test("flags IPv6 loopback, link-local, and unique-local ranges", () => {
    expect(isPrivateAddress("::1")).toBe(true)
    expect(isPrivateAddress("fe80::1")).toBe(true)
    expect(isPrivateAddress("fd00::1")).toBe(true)
    expect(isPrivateAddress("ff02::1")).toBe(true)
  })

  test("accepts a public IPv6 address", () => {
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false)
  })
})
