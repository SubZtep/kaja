export const locales = ["en-GB", "en-US", "hu-HU", "nan-TW", "zh-TW"] as const

export type Locale = (typeof locales)[number]

/** Native-language display name for each supported locale. */
export const LOCALE_LABELS: Record<Locale, string> = {
  "en-GB": "British English",
  "en-US": "American English",
  "hu-HU": "Magyar",
  "nan-TW": "臺語",
  "zh-TW": "繁體中文"
}

/** A language tag from anywhere — a page's `<html lang>`, a browser, a Telegram app ("hu", "zh-Hant", "hu-HU") — as a supported locale, matched exactly or else by its language alone (any Chinese is zh-TW, the only Chinese there is; any English but en-US is en-GB, the first listed). Undefined when nothing matches. */
export function matchLocale(tag: string | null | undefined): Locale | undefined {
  const lower = tag?.trim().toLowerCase().replaceAll("_", "-")
  if (!lower) return undefined
  const language = lower.split("-")[0]
  return (
    locales.find(locale => locale.toLowerCase() === lower) ??
    locales.find(locale => locale.split("-")[0]!.toLowerCase() === language)
  )
}
