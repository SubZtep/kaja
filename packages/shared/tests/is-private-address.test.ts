import { describe, expect, test } from "bun:test"
import { isPrivateAddress } from "../net"

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

  // dns.lookup hands AAAA answers back in these forms, so each must be judged by the IPv4 it carries
  test.each([
    ["::ffff:127.0.0.1", "mapped, dotted"],
    ["::ffff:7f00:1", "mapped, hex"],
    ["::FFFF:169.254.169.254", "mapped, upper case, metadata service"],
    ["::ffff:10.0.0.1", "mapped, RFC1918"],
    ["::ffff:0:127.0.0.1", "translated"],
    ["::127.0.0.1", "compatible"],
    ["64:ff9b::7f00:1", "NAT64 of loopback"],
    ["64:ff9b::10.0.0.1", "NAT64 of RFC1918"],
    ["2002:7f00:1::", "6to4 of loopback"],
    ["2002:c0a8:101::1", "6to4 of 192.168.1.1"]
  ])("flags %s (%s)", address => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  test.each([
    ["::ffff:8.8.8.8", "mapped"],
    ["64:ff9b::808:808", "NAT64"],
    ["2002:808:808::", "6to4"]
  ])("accepts %s (%s of a public IPv4)", address => {
    expect(isPrivateAddress(address)).toBe(false)
  })

  test("flags the unspecified address, local-use NAT64 and site-local IPv6", () => {
    expect(isPrivateAddress("::")).toBe(true)
    expect(isPrivateAddress("64:ff9b:1::1")).toBe(true)
    expect(isPrivateAddress("fec0::1")).toBe(true)
  })

  test("reads expanded, bracketed and zoned IPv6 forms", () => {
    expect(isPrivateAddress("0:0:0:0:0:0:0:1")).toBe(true)
    expect(isPrivateAddress("[::1]")).toBe(true)
    expect(isPrivateAddress("fe80::1%eth0")).toBe(true)
    expect(isPrivateAddress("2001:4860:4860:0:0:0:0:8888")).toBe(false)
  })

  test("treats anything that isn't a valid IPv6 address as private", () => {
    expect(isPrivateAddress(":::")).toBe(true)
    expect(isPrivateAddress("1:2:3")).toBe(true)
    expect(isPrivateAddress("::ffff:300.0.0.1")).toBe(true)
    expect(isPrivateAddress("1::2::3")).toBe(true)
  })
})
