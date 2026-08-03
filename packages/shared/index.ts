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
  return `"${s.replaceAll('"', String.raw`\"`)}"`
}
