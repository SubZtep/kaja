/** Query parameters that say where a visitor came from, never which page it is. */
const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi)$/i

/**
 * What makes two links the same page: host (without `www.`) and path (without a trailing slash), plus the query less
 * its tracking parameters, sorted. Scheme and fragment are left out. Undefined for anything but an http(s) URL.
 */
export function urlKey(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return undefined
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
  const host = parsed.host.replace(/^www\./, "")
  const path = parsed.pathname.replace(/\/+$/, "")
  const params = [...parsed.searchParams].filter(([name]) => !TRACKING.test(name))
  params.sort(([a], [b]) => a.localeCompare(b))
  const query = new URLSearchParams(params).toString()
  return `${host}${path}${query ? `?${query}` : ""}`
}
