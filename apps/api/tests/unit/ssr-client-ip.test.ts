import { describe, expect, test } from "bun:test"
import { SSR_CLIENT_IP_HEADER, SSR_SECRET_HEADER } from "@kaja/schema/api"
import { trustedSsrClientIp, withSsrClientIp } from "../../src/core/ssr-client-ip"

const ssrHeaders = (secret: string, ip = "203.0.113.7") =>
  new Headers({ [SSR_SECRET_HEADER]: secret, [SSR_CLIENT_IP_HEADER]: ip, "x-forwarded-for": "46.224.234.79" })

describe("trustedSsrClientIp", () => {
  test("returns the vouched IP with the right secret", () => {
    expect(trustedSsrClientIp(ssrHeaders("s3cret"), "s3cret")).toBe("203.0.113.7")
  })

  test("fails closed without a configured secret", () => {
    expect(trustedSsrClientIp(ssrHeaders(""), undefined)).toBeUndefined()
    expect(trustedSsrClientIp(ssrHeaders(""), "")).toBeUndefined()
  })

  test("rejects a wrong or missing secret", () => {
    expect(trustedSsrClientIp(ssrHeaders("wrong!"), "s3cret")).toBeUndefined()
    expect(trustedSsrClientIp(ssrHeaders("s3cret-longer"), "s3cret")).toBeUndefined()
    expect(trustedSsrClientIp(new Headers({ [SSR_CLIENT_IP_HEADER]: "203.0.113.7" }), "s3cret")).toBeUndefined()
  })
})

describe("withSsrClientIp", () => {
  const url = "https://api.test/auth/get-session"

  test("passes a request without SSR headers through untouched", () => {
    const req = new Request(url)
    expect(withSsrClientIp(req, "s3cret")).toBe(req)
  })

  test("sets X-Forwarded-For to the vouched IP and strips the SSR headers", () => {
    const out = withSsrClientIp(new Request(url, { headers: ssrHeaders("s3cret") }), "s3cret")
    expect(out.headers.get("x-forwarded-for")).toBe("203.0.113.7")
    expect(out.headers.has(SSR_SECRET_HEADER)).toBe(false)
    expect(out.headers.has(SSR_CLIENT_IP_HEADER)).toBe(false)
  })

  test("keeps the proxy's X-Forwarded-For when the secret is wrong", () => {
    const out = withSsrClientIp(new Request(url, { headers: ssrHeaders("wrong!") }), "s3cret")
    expect(out.headers.get("x-forwarded-for")).toBe("46.224.234.79")
    expect(out.headers.has(SSR_CLIENT_IP_HEADER)).toBe(false)
  })
})
