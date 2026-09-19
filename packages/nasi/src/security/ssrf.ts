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

type HopRequest = { method: string; headers?: Record<string, string>; body?: string }

/** One hop, with its own timeout. Never follows redirects — the caller re-checks each hop's URL before continuing. */
async function fetchHop(
  url: string,
  timeoutMs: number,
  proxy: string | undefined,
  request: HopRequest
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
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

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/** 303, and 301/302 after a POST, turn into a body-less GET (what browsers do); 307/308 repeat the request as is. */
function requestAfterRedirect(status: number, request: HopRequest): HopRequest {
  if (status === 303 || ((status === 301 || status === 302) && request.method === "POST")) {
    return { method: "GET", headers: request.headers }
  }
  return request
}

/** Throws {@link UnsafeUrlError} unless `url` may be fetched: http(s) only, and (without `allowPrivate`) a public host whose DNS answers are public too (skipped behind a proxy, which resolves for itself). */
async function assertHopAllowed(url: string, opts: { allowPrivate?: boolean; proxy?: string }): Promise<void> {
  if (opts.allowPrivate) {
    if (!isHttpUrl(url)) throw new UnsafeUrlError(url)
    return
  }
  if (!isPublicHttpUrl(url)) throw new UnsafeUrlError(url)
  if (!opts.proxy && !(await hasOnlyPublicAddresses(new URL(url).hostname))) throw new UnsafeUrlError(url)
}

export type FetchPublicHttpOptions = {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  proxy?: string
  /** Default GET. */
  method?: string
  headers?: Record<string, string>
  body?: string
  /** Skip the private/loopback checks (local mode only: the user's own network is fair game there). Still http(s) only. */
  allowPrivate?: boolean
  /** Refuse a redirect to another origin, so credentials in `headers` never reach a host the caller didn't choose. */
  sameOriginRedirects?: boolean
}

/**
 * Fetch a public http(s) URL (GET unless `opts.method` says otherwise). Re-checks each redirect hop against {@link isPublicHttpUrl}.
 *
 * @param opts.proxy - HTTP(S) proxy to egress through. Applies to every redirect hop. Fails closed: if the proxy is unreachable the request throws {@link ProxyUnavailableError} rather than falling back to a direct connection.
 */
export async function fetchPublicHttp(url: string, opts?: FetchPublicHttpOptions): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  let current = url
  let request: HopRequest = { method: opts?.method ?? "GET", headers: opts?.headers, body: opts?.body }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertHopAllowed(current, opts ?? {})

    const res = await fetchHop(current, timeoutMs, opts?.proxy, request)
    const next = redirectTarget(res, current)
    if (next) {
      if (opts?.sameOriginRedirects && new URL(next).origin !== new URL(current).origin) {
        throw new Error(`Refused a redirect to another host: ${next}`)
      }
      request = requestAfterRedirect(res.status, request)
      current = next
      continue
    }

    const buf = await readCapped(res, maxBytes)
    return new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers })
  }
  throw new Error(`Too many redirects fetching ${url}`)
}

/** The `fetch` shape long-lived HTTP clients take (the MCP SDK's transports among them). */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>

/**
 * A `fetch` for long-lived clients such as the MCP SDK's transports: every hop gets the same checks as
 * {@link fetchPublicHttp} (public http(s) host, DNS answers public unless proxied), redirects are
 * followed here and only within the same origin (headers may carry the user's key), and the body is
 * streamed rather than buffered, so an SSE stream stays open. Egresses through `proxy` when set, failing
 * closed with {@link ProxyUnavailableError} rather than going direct.
 */
export function createGuardedFetch(opts: { proxy?: string; maxRedirects?: number } = {}): FetchLike {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  return async (input, init) => {
    let current = String(input)
    let request: RequestInit = init ?? {}
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertHopAllowed(current, opts)
      let res: Response
      try {
        res = await fetch(current, { ...request, redirect: "manual", ...(opts.proxy ? { proxy: opts.proxy } : {}) })
      } catch (error) {
        if (opts.proxy && !request.signal?.aborted) throw new ProxyUnavailableError(current, error)
        throw error
      }
      const next = redirectTarget(res, current)
      if (!next) return res
      await res.body?.cancel()
      if (new URL(next).origin !== new URL(current).origin)
        throw new Error(`Refused a redirect to another host: ${next}`)
      const method = (request.method ?? "GET").toUpperCase()
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
        request = { ...request, method: "GET", body: undefined }
      }
      current = next
    }
    throw new Error(`Too many redirects fetching ${String(input)}`)
  }
}
