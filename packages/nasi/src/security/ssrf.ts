import dns from "node:dns"
import { isIP } from "node:net"
import { isPrivateAddress, isPublicHttpUrl } from "@kaja/shared/net"

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_BYTES = 256 * 1024
const DEFAULT_MAX_REDIRECTS = 3

export class UnsafeUrlError extends Error {
  constructor(url: string) {
    super(`Blocked non-public URL: ${url}`)
    this.name = "UnsafeUrlError"
  }
}

/** The address a checked hop connects to, so the name can't resolve differently between the check and the connection. */
type Pin = { address: string; family: number }

/**
 * `isPublicHttpUrl` only inspects the literal hostname, so a DNS name that resolves to a private/loopback address
 * (attacker-controlled DNS) sails through it. This resolves the hostname once and refuses it if any answer is private;
 * the hop then connects to that very address (see {@link pinned}), so a second lookup that answers differently (DNS
 * rebinding) never happens. Not used with a `send`: the sender (the sandbox) resolves and checks for itself.
 */
async function checkedAddress(hostname: string): Promise<Pin | undefined> {
  try {
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true })
    if (records.length === 0 || records.some(r => isPrivateAddress(r.address))) return undefined
    return records[0]
  } catch {
    return undefined
  }
}

/**
 * The request for a pinned hop: the checked address in the URL, the host kept in `Host` and in `tls.serverName`, so
 * SNI and the certificate check still name the host (Bun's documented way to connect to an address you resolved).
 * A name with several addresses gets no fallback to the others.
 */
function pinned(
  url: string,
  pin: Pin | undefined,
  headers: HeadersInit | undefined
): { url: string; init: BunFetchRequestInit } {
  if (!pin) return { url, init: { headers } }
  const target = new URL(url)
  const pinnedHeaders = new Headers(headers)
  pinnedHeaders.set("host", target.host)
  const serverName = target.hostname
  target.hostname = pin.family === 6 ? `[${pin.address}]` : pin.address
  return { url: target.toString(), init: { headers: pinnedHeaders, tls: { serverName } } }
}

type HopRequest = { method: string; headers?: Record<string, string>; body?: string }

/** One hop, with its own timeout. Never follows redirects — the caller re-checks each hop's URL before continuing. */
async function fetchHop(
  url: string,
  timeoutMs: number,
  send: FetchLike | undefined,
  request: HopRequest,
  pin: Pin | undefined
): Promise<Response> {
  const init = {
    method: request.method,
    body: request.body,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs)
  } as const
  if (send) return send(url, { ...init, headers: request.headers })
  const hop = pinned(url, pin, request.headers)
  return fetch(hop.url, { ...hop.init, ...init })
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
function becomesGet(status: number, method: string): boolean {
  return status === 303 || ((status === 301 || status === 302) && method === "POST")
}

function requestAfterRedirect(status: number, request: HopRequest): HopRequest {
  return becomesGet(status, request.method) ? { method: "GET", headers: request.headers } : request
}

/**
 * Throws {@link UnsafeUrlError} unless `url` may be fetched: http(s) only, and (without `allowPrivate`) a public host
 * whose DNS answers are public too. Returns the address the hop must connect to when it looked the name up (not with a
 * `send`, which resolves for itself; not for an IP literal, which is what it is).
 */
async function assertHopAllowed(
  url: string,
  opts: { allowPrivate?: boolean; send?: FetchLike }
): Promise<Pin | undefined> {
  if (opts.allowPrivate) {
    if (!isHttpUrl(url)) throw new UnsafeUrlError(url)
    return undefined
  }
  if (!isPublicHttpUrl(url)) throw new UnsafeUrlError(url)
  const { hostname } = new URL(url)
  if (opts.send || isIP(hostname) || hostname.startsWith("[")) return undefined
  const pin = await checkedAddress(hostname)
  if (!pin) throw new UnsafeUrlError(url)
  return pin
}

export type FetchPublicHttpOptions = {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Sends each hop instead of connecting from here (the cloud: through a sandbox, which checks the address itself). */
  send?: FetchLike
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
 * @param opts.send - Sends every hop (redirects too) instead of a direct, DNS-pinned connection; never falls back to one.
 */
export async function fetchPublicHttp(url: string, opts?: FetchPublicHttpOptions): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  let current = url
  let request: HopRequest = { method: opts?.method ?? "GET", headers: opts?.headers, body: opts?.body }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const pin = await assertHopAllowed(current, opts ?? {})

    const res = await fetchHop(current, timeoutMs, opts?.send, request, pin)
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
 * streamed rather than buffered, so an SSE stream stays open. Sends every hop through `send` when set, never direct.
 */
export function createGuardedFetch(opts: { send?: FetchLike; maxRedirects?: number } = {}): FetchLike {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  return async (input, init) => {
    let current = String(input)
    let request: RequestInit = init ?? {}
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const pin = await assertHopAllowed(current, opts)
      const res = await streamHop(current, request, opts.send, pin)
      const next = redirectTarget(res, current)
      if (!next) return res
      await res.body?.cancel()
      if (new URL(next).origin !== new URL(current).origin)
        throw new Error(`Refused a redirect to another host: ${next}`)
      if (becomesGet(res.status, (request.method ?? "GET").toUpperCase())) {
        request = { ...request, method: "GET", body: undefined }
      }
      current = next
    }
    throw new Error(`Too many redirects fetching ${String(input)}`)
  }
}

// One hop of the guarded fetch: the body is left to stream and redirects aren't followed.
function streamHop(url: string, request: RequestInit, send: FetchLike | undefined, pin: Pin | undefined) {
  if (send) return send(url, { ...request, redirect: "manual" })
  const hop = pinned(url, pin, request.headers)
  return fetch(hop.url, { ...request, ...hop.init, redirect: "manual" })
}
