import dns from "node:dns"
import { isPrivateAddress, isPublicHttpUrl } from "@kaja/shared"

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_BYTES = 256 * 1024
const DEFAULT_MAX_REDIRECTS = 3

export class UnsafeUrlError extends Error {
  constructor(url: string) {
    super(`Blocked non-public URL: ${url}`)
    this.name = "UnsafeUrlError"
  }
}

/** A proxied fetch that never reached the proxy. Separate from an origin-side failure so "the proxy is down" and "that site is down" are distinguishable in logs; the request is never retried direct, which would silently defeat the proxy. */
export class ProxyUnavailableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Proxy unreachable fetching ${url}: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = "ProxyUnavailableError"
  }
}

/**
 * `isPublicHttpUrl` only inspects the literal hostname, so a DNS name that resolves to a private/
 * loopback address (attacker-controlled DNS, or a rebinding attack) sails through it. This resolves
 * the hostname and rejects if any address it comes back with is private — closing that gap for the
 * direct-fetch path. Skipped when a `proxy` is set: the proxy does its own egress resolution/policy,
 * a different trust boundary this check can't see into anyway.
 */
async function hasOnlyPublicAddresses(hostname: string): Promise<boolean> {
  try {
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true })
    return records.length > 0 && records.every(r => !isPrivateAddress(r.address))
  } catch {
    return false
  }
}

/** One hop, with its own timeout. Never follows redirects — the caller re-checks each hop's URL before continuing. */
async function fetchHop(url: string, timeoutMs: number, proxy: string | undefined): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      ...(proxy ? { proxy } : {})
    })
  } catch (error) {
    // A timeout aborts the same way with or without a proxy, so it stays a timeout; anything else on a proxied fetch failed before reaching the origin.
    if (proxy && !controller.signal.aborted) throw new ProxyUnavailableError(url, error)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Reads the body, aborting as soon as it exceeds maxBytes so an oversized response is never buffered whole. */
async function readCapped(res: Response, maxBytes: number): Promise<ArrayBuffer> {
  if (!res.body) return new ArrayBuffer(0)

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`Response too large (>${maxBytes} bytes)`)
    }
    chunks.push(value)
  }

  const buf = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buf.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buf.buffer
}

/** The redirect target, or undefined when the response isn't a redirect. */
function redirectTarget(res: Response, current: string): string | undefined {
  if (res.status < 300 || res.status >= 400) return undefined
  const location = res.headers.get("location")
  if (!location) throw new Error(`Redirect with no Location header from ${current}`)
  return new URL(location, current).toString()
}

/**
 * GET a public http(s) URL. Re-checks each redirect hop against {@link isPublicHttpUrl}.
 *
 * @param opts.proxy - HTTP(S) proxy to egress through. Applies to every redirect hop. Fails closed: if the proxy is unreachable the request throws {@link ProxyUnavailableError} rather than falling back to a direct connection.
 */
export async function fetchPublicHttp(
  url: string,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; proxy?: string }
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  let current = url
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isPublicHttpUrl(current)) throw new UnsafeUrlError(current)
    if (!opts?.proxy && !(await hasOnlyPublicAddresses(new URL(current).hostname))) throw new UnsafeUrlError(current)

    const res = await fetchHop(current, timeoutMs, opts?.proxy)
    const next = redirectTarget(res, current)
    if (next) {
      current = next
      continue
    }

    const buf = await readCapped(res, maxBytes)
    return new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  throw new Error(`Too many redirects fetching ${url}`)
}
