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

// The eight 16-bit groups of an IPv6 address (brackets and a zone id allowed, `::` expanded, a trailing dotted IPv4 as the last two groups), or null when it isn't one.
function ipv6Groups(address: string): number[] | null {
  let text =
    address
      .replace(/^\[|\]$/g, "")
      .toLowerCase()
      .split("%")[0] ?? ""
  const lastColon = text.lastIndexOf(":")
  const tail = text.slice(lastColon + 1)
  if (tail.includes(".")) {
    const octets = tail.split(".")
    if (octets.length !== 4 || !octets.every(o => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return null
    const [a, b, c, d] = octets.map(Number) as [number, number, number, number]
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const rest = halves[1] ? halves[1].split(":") : []
  const gap = 8 - head.length - rest.length
  if (halves.length === 1 ? gap !== 0 : gap < 1) return null
  const parts = [...head, ...Array<string>(halves.length === 2 ? gap : 0).fill("0"), ...rest]
  if (!parts.every(p => /^[0-9a-f]{1,4}$/.test(p))) return null
  return parts.map(p => Number.parseInt(p, 16))
}

// The IPv4 address an IPv6 one carries, for the forms that reach it: mapped (::ffff:a.b.c.d), translated (::ffff:0:a.b.c.d), compatible (::a.b.c.d, also :: and ::1), NAT64 (64:ff9b::a.b.c.d) and 6to4 (2002:aabb:ccdd::).
function embeddedIpv4(groups: number[]): string | null {
  const g = (i: number) => groups[i] ?? 0
  const zeros = (from: number, to: number) => groups.slice(from, to).every(x => x === 0)
  const ipv4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".")
  if (zeros(0, 5) && g(5) === 0xffff) return ipv4(g(6), g(7))
  if (zeros(0, 4) && g(4) === 0xffff && g(5) === 0) return ipv4(g(6), g(7))
  if (zeros(0, 6)) return ipv4(g(6), g(7))
  if (g(0) === 0x64 && g(1) === 0xff9b && zeros(2, 6)) return ipv4(g(6), g(7))
  if (g(0) === 0x2002) return ipv4(g(1), g(2))
  return null
}

/** Private IPv6: any form carrying a private IPv4, local-use NAT64 (64:ff9b:1::/48), link-local, site-local, unique-local and multicast. Anything unparseable counts as private. */
function isPrivateIpv6(address: string): boolean {
  const groups = ipv6Groups(address)
  if (!groups) return true
  const ipv4 = embeddedIpv4(groups)
  if (ipv4) return isPrivateIpv4(ipv4)
  const first = groups[0] ?? 0
  if (first === 0x64 && groups[1] === 0xff9b && groups[2] === 1) return true // 64:ff9b:1::/48 (local-use NAT64)
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 (link-local)
  if ((first & 0xffc0) === 0xfec0) return true // fec0::/10 (site-local, deprecated but still routed by some stacks)
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 (unique local)
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 (multicast)
  return false
}

/** Whether a bare IP address (no scheme/hostname wrapping) falls in a private/loopback/link-local range, including IPv6 forms that carry a private IPv4 (e.g. `::ffff:127.0.0.1`). */
export function isPrivateAddress(address: string): boolean {
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
    if (hostname.startsWith("[")) return !isPrivateIpv6(hostname)
    return !isPrivateIpv4(hostname)
  } catch {
    return false
  }
}
