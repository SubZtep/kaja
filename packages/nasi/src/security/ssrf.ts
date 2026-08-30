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

/**
 * GET a public http(s) URL. Re-checks each redirect hop against {@link isPublicHttpUrl}.
 */
export async function fetchPublicHttp(
  url: string,
  opts?: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number }
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
      res = await fetch(current, { redirect: "manual", signal: controller.signal })
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
