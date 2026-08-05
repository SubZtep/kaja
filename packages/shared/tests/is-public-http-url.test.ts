import { describe, expect, test } from "bun:test"
import { isPublicHttpUrl } from "../index"

describe("isPublicHttpUrl", () => {
  test("accepts public http(s) URLs", () => {
    expect(isPublicHttpUrl("https://api.openai.com")).toBe(true)
    expect(isPublicHttpUrl("http://example.com:8080")).toBe(true)
  })

  test("rejects non-http(s) protocols", () => {
    expect(isPublicHttpUrl("ftp://example.com")).toBe(false)
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false)
    expect(isPublicHttpUrl("not-a-url")).toBe(false)
  })

  test("rejects loopback and localhost", () => {
    expect(isPublicHttpUrl("http://localhost")).toBe(false)
    expect(isPublicHttpUrl("http://127.0.0.1")).toBe(false)
    expect(isPublicHttpUrl("http://[::1]")).toBe(false)
  })

  test("rejects link-local addresses (incl. cloud metadata endpoint)", () => {
    expect(isPublicHttpUrl("http://169.254.169.254")).toBe(false)
  })

  test("rejects RFC1918 private ranges", () => {
    expect(isPublicHttpUrl("http://10.0.0.5")).toBe(false)
    expect(isPublicHttpUrl("http://172.16.0.1")).toBe(false)
    expect(isPublicHttpUrl("http://172.31.255.255")).toBe(false)
    expect(isPublicHttpUrl("http://192.168.1.1")).toBe(false)
  })

  test("does not reject public addresses that merely look similar", () => {
    expect(isPublicHttpUrl("http://172.32.0.1")).toBe(true)
    expect(isPublicHttpUrl("http://172.15.0.1")).toBe(true)
    expect(isPublicHttpUrl("http://11.0.0.1")).toBe(true)
  })

  test("rejects CGNAT shared address space (RFC 6598)", () => {
    expect(isPublicHttpUrl("http://100.64.0.1")).toBe(false)
    expect(isPublicHttpUrl("http://100.127.255.255")).toBe(false)
    expect(isPublicHttpUrl("http://100.63.0.1")).toBe(true)
    expect(isPublicHttpUrl("http://100.128.0.1")).toBe(true)
  })

  test("rejects IPv4-mapped IPv6 loopback and private addresses", () => {
    expect(isPublicHttpUrl("http://[::ffff:127.0.0.1]")).toBe(false)
    expect(isPublicHttpUrl("http://[::ffff:192.168.1.1]")).toBe(false)
    expect(isPublicHttpUrl("http://[::ffff:10.0.0.1]")).toBe(false)
  })

  test("does not treat a private-looking hostname suffix as an IP", () => {
    expect(isPublicHttpUrl("http://192.168.1.1.evil.com")).toBe(true)
  })
})
