export const locales = ["en-GB", "en-US", "hu-HU", "nan-TW", "zh-TW"] as const

export type Locale = (typeof locales)[number]

/** The source language: every other locale file is translated from it, and it is the fallback for a missing string. */
export const baseLocale: Locale = "en-GB"

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

/** A parsed locale file's nested tables as one flat map of dotted keys (`cli.invalidConfig`) to strings. */
export function flattenMessages(table: Record<string, unknown>, prefix = "", out = new Map<string, string>()) {
  for (const [key, value] of Object.entries(table)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else if (value && typeof value === "object") flattenMessages(value as Record<string, unknown>, path, out)
  }
  return out
}

/** A message with its `{param}` placeholders filled in; a placeholder without a param stays as it is. */
export function formatMessage(template: string, params?: Record<string, string | number>): string {
  return params
    ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    : template
}

/**
 * Every locale's messages, flattened, and a lookup in one of them with `{param}` interpolation that falls back to
 * en-GB, then to the key. Each app passes its own locale files (bundlers only inline static imports).
 */
export function createMessages(files: Record<Locale, Record<string, unknown>>) {
  const dictionaries = Object.fromEntries(locales.map(locale => [locale, flattenMessages(files[locale])])) as Record<
    Locale,
    Map<string, string>
  >
  return {
    dictionaries,
    translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
      return formatMessage(dictionaries[locale].get(key) ?? dictionaries[baseLocale].get(key) ?? key, params)
    }
  }
}
