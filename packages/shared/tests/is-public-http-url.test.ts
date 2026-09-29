import { describe, expect, test } from "bun:test"
import { isPublicHttpUrl } from "../net"

// [url, why]
const REFUSED: [string, string][] = [
  ["ftp://example.com", "not http(s)"],
  ["file:///etc/passwd", "not http(s)"],
  ["not-a-url", "not a URL"],
  ["http://localhost", "loopback name"],
  ["http://127.0.0.1", "IPv4 loopback"],
  ["http://[::1]", "IPv6 loopback"],
  ["http://169.254.169.254", "link-local (cloud metadata endpoint)"],
  ["http://10.0.0.5", "RFC1918"],
  ["http://172.16.0.1", "RFC1918"],
  ["http://172.31.255.255", "RFC1918"],
  ["http://192.168.1.1", "RFC1918"],
  ["http://100.64.0.1", "CGNAT (RFC 6598)"],
  ["http://100.127.255.255", "CGNAT (RFC 6598)"],
  ["http://[::ffff:127.0.0.1]", "IPv4-mapped loopback"],
  ["http://[::ffff:192.168.1.1]", "IPv4-mapped RFC1918"],
  ["http://[::ffff:10.0.0.1]", "IPv4-mapped RFC1918"],
  ["http://[::]", "IPv6 unspecified"],
  ["http://[fd00::1]/", "IPv6 unique-local"],
  ["http://[fe80::1]/", "IPv6 link-local"],
  ["http://[64:ff9b::7f00:1]/", "NAT64 of loopback"],
  ["http://[2002:7f00:1::]/", "6to4 of loopback"]
]

const ALLOWED: [string, string][] = [
  ["https://api.openai.com", "public name"],
  ["http://example.com:8080", "public name with a port"],
  ["http://172.32.0.1", "just past RFC1918's 172.16/12"],
  ["http://172.15.0.1", "just before RFC1918's 172.16/12"],
  ["http://11.0.0.1", "just past 10/8"],
  ["http://100.63.0.1", "just before CGNAT"],
  ["http://100.128.0.1", "just past CGNAT"],
  ["https://[2001:4860:4860::8888]/", "public IPv6 literal"],
  ["http://192.168.1.1.evil.com", "a private-looking name, not an IP"]
]

describe("isPublicHttpUrl", () => {
  test.each(REFUSED)("refuses %s (%s)", url => {
    expect(isPublicHttpUrl(url)).toBe(false)
  })

  test.each(ALLOWED)("accepts %s (%s)", url => {
    expect(isPublicHttpUrl(url)).toBe(true)
  })
})
