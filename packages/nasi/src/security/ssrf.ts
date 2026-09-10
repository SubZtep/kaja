import { isPublicHttpUrl } from "@kaja/shared"

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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        ...(opts?.proxy ? { proxy: opts.proxy } : {})
      })
    } catch (error) {
      // A timeout aborts the same way with or without a proxy, so it stays a timeout; anything else on a proxied fetch failed before reaching the origin.
      if (opts?.proxy && !controller.signal.aborted) throw new ProxyUnavailableError(current, error)
      throw error
    } finally {
      clearTimeout(timer)
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (!location) throw new Error(`Redirect with no Location header from ${current}`)
      current = new URL(location, current).toString()
      continue
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > maxBytes) throw new Error(`Response too large (${buf.byteLength} bytes)`)
    return new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  throw new Error(`Too many redirects fetching ${url}`)
}
