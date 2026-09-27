const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::1]", "::1"])

/** IPv4 ranges not safe to forward to: "this network" (0.0.0.0 reaches loopback), loopback, link-local (incl. cloud metadata), CGNAT, RFC1918, multicast and reserved. */
function isPrivateIpv4(ipv4: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ipv4)
  if (!match) return false
  const [a, b] = [Number(match[1]), Number(match[2])]
  if (a === 0 || a === 127 || a >= 224) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 hostname. The URL
 * parser normalizes these to hex group form, e.g. `[::ffff:127.0.0.1]` becomes
 * `[::ffff:7f00:1]` (the last two 16-bit groups are the 4 IPv4 octets).
 */
function extractIpv4MappedAddress(hostname: string): string | null {
  const match = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(hostname)
  if (!match?.[1] || !match[2]) return null
  const hi = Number.parseInt(match[1].padStart(4, "0"), 16)
  const lo = Number.parseInt(match[2].padStart(4, "0"), 16)
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".")
}

/** Loopback, link-local, and unique-local IPv6 ranges — mirrors {@link isPrivateIpv4}'s IPv4 coverage. */
function isPrivateIpv6(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase()
  if (normalized === "::1" || normalized === "::") return true
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true // fe80::/10 (link-local)
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true // fc00::/7 (unique local)
  if (/^ff[0-9a-f]{2}:/.test(normalized)) return true // ff00::/8 (multicast)
  return false
}

/** Whether a bare IP address (no scheme/hostname wrapping) falls in a private/loopback/link-local range. */
export function isPrivateAddress(address: string): boolean {
  const mappedIpv4 = extractIpv4MappedAddress(address.startsWith("[") ? address : `[${address}]`)
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4)
  if (address.includes(":")) return isPrivateIpv6(address)
  return isPrivateIpv4(address)
}

/**
 * @returns `true` if `url` is an http(s) URL pointing at a public host — guards
 * against SSRF to loopback/link-local/private addresses (e.g. cloud metadata endpoints).
 */
export function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const hostname = u.hostname.toLowerCase()
    if (PRIVATE_HOSTNAMES.has(hostname)) return false
    const mappedIpv4 = extractIpv4MappedAddress(hostname)
    if (isPrivateIpv4(mappedIpv4 ?? hostname)) return false
    return true
  } catch {
    return false
  }
}
