import { describe, expect, test } from "bun:test"
import { isPrivateAddress } from "../net"

// [address, why]; dns.lookup hands AAAA answers back in any of the IPv6 forms, so each is judged by the IPv4 it carries
const PRIVATE: [string, string][] = [
  ["127.0.0.1", "IPv4 loopback"],
  ["169.254.169.254", "link-local (cloud metadata)"],
  ["10.0.0.5", "RFC1918"],
  ["192.168.1.1", "RFC1918"],
  ["0.0.0.0", "this network (reaches loopback on Linux)"],
  ["0.1.2.3", "this network"],
  ["224.0.0.1", "multicast"],
  ["255.255.255.255", "reserved"],
  ["::1", "IPv6 loopback"],
  ["::", "IPv6 unspecified"],
  ["fe80::1", "IPv6 link-local"],
  ["fec0::1", "IPv6 site-local"],
  ["fd00::1", "IPv6 unique-local"],
  ["ff02::1", "IPv6 multicast"],
  ["64:ff9b:1::1", "local-use NAT64"],
  ["::ffff:127.0.0.1", "mapped, dotted"],
  ["::ffff:7f00:1", "mapped, hex"],
  ["::FFFF:169.254.169.254", "mapped, upper case, metadata service"],
  ["::ffff:10.0.0.1", "mapped, RFC1918"],
  ["::ffff:0:127.0.0.1", "translated"],
  ["::127.0.0.1", "compatible"],
  ["64:ff9b::7f00:1", "NAT64 of loopback"],
  ["64:ff9b::10.0.0.1", "NAT64 of RFC1918"],
  ["2002:7f00:1::", "6to4 of loopback"],
  ["2002:c0a8:101::1", "6to4 of 192.168.1.1"],
  ["0:0:0:0:0:0:0:1", "expanded loopback"],
  ["[::1]", "bracketed loopback"],
  ["fe80::1%eth0", "zoned link-local"],
  [":::", "not an IPv6 address"],
  ["1:2:3", "too few groups"],
  ["::ffff:300.0.0.1", "bad embedded IPv4"],
  ["1::2::3", "two ::"]
]

const PUBLIC: [string, string][] = [
  ["8.8.8.8", "public IPv4"],
  ["223.255.255.255", "just below multicast"],
  ["2001:4860:4860::8888", "public IPv6"],
  ["2001:4860:4860:0:0:0:0:8888", "public IPv6, expanded"],
  ["::ffff:8.8.8.8", "mapped public IPv4"],
  ["64:ff9b::808:808", "NAT64 of a public IPv4"],
  ["2002:808:808::", "6to4 of a public IPv4"]
]

describe("isPrivateAddress", () => {
  test.each(PRIVATE)("flags %s (%s)", address => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  test.each(PUBLIC)("accepts %s (%s)", address => {
    expect(isPrivateAddress(address)).toBe(false)
  })
})
