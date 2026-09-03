import clsx, { type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** Calculates the relative time interval. */
export function getTimeAgo(time: Date, now = new Date(), locale?: Intl.LocalesArgument) {
  const monthDiff = (dateFrom: Date, dateTo: Date) =>
    dateTo.getMonth() - dateFrom.getMonth() + 12 * (dateTo.getFullYear() - dateFrom.getFullYear())

  let value
  const diff = (now.getTime() - time.getTime()) / 1000
  const seconds = Math.floor(diff)
  const minutes = Math.floor(diff / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  // const months = Math.floor(days / 30)
  const months = monthDiff(time, now)
  const years = Math.floor(months / 12)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })

  if (years > 0) {
    value = rtf.format(0 - years, "year")
  } else if (months > 0) {
    value = rtf.format(0 - months, "month")
  } else if (days > 0) {
    value = rtf.format(0 - days, "day")
  } else if (hours > 0) {
    value = rtf.format(0 - hours, "hour")
  } else if (minutes > 0) {
    value = rtf.format(0 - minutes, "minute")
  } else {
    value = rtf.format(0 - seconds, "second")
  }
  return value
}

export function getDateTime(time: Date, style: "short" | "full" | "long" | "medium", locale?: Intl.LocalesArgument) {
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: style }).format(time)
}

/** Extracts the first part of a name. */
export function getFirstName(fullName?: string, prefix = " ") {
  return fullName ? prefix + fullName.split(" ").shift() : ""
}

/** Capitalize the first letter of the given string. */
export function capitalized(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Merge CSS class names. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** @returns `true` if the given string is an image URL. */
export function isImageUrl(value?: string | null) {
  if (!value) return false
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`)
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)$/i.test(url.pathname)
  } catch {
    return false
  }
}

/** Determines the boolean value represented by a string. */
export function isItTrue(value = "") {
  const normalized = value.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized.startsWith("y")
}

/** Escape a string for TOML encoding. */
export function tomlString(s: string) {
  const escaped = s.replaceAll('"', String.raw`\"`)
  return `"${escaped}"`
}

const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::1]", "::1"])

/** IPv4 ranges not safe to forward to: loopback, link-local (incl. cloud metadata), CGNAT, RFC1918. */
function isPrivateIpv4(ipv4: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ipv4)
  if (!match) return false
  const [a, b] = [Number(match[1]), Number(match[2])]
  if (a === 127) return true
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

/** Generates a UUIDv7 (time-ordered, RFC 9562). Falls back to `crypto.randomUUID` if unavailable. */
export function randomUUIDv7(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const ts = Date.now()

  bytes[0] = (ts / 2 ** 40) & 0xff
  bytes[1] = (ts / 2 ** 32) & 0xff
  bytes[2] = (ts / 2 ** 24) & 0xff
  bytes[3] = (ts / 2 ** 16) & 0xff
  bytes[4] = (ts / 2 ** 8) & 0xff
  bytes[5] = ts & 0xff
  bytes[6] = 0x70 | (bytes[6]! & 0x0f)
  bytes[8] = 0x80 | (bytes[8]! & 0x3f)

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Title-cases a hyphen/underscore/space-separated label or top bar
 * @example "my/kimi-k2" → "Kimi K2".
 */
export function titleCase(label?: string) {
  if (label == null) return null
  return (label.split("/").pop() ?? label)
    .split(/[-_\s]+/)
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ")
}
