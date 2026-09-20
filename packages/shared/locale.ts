export const locales = ["en-GB", "hu-HU", "nan-TW", "zh-TW"] as const

export type Locale = (typeof locales)[number]

/** Native-language display name for each supported locale. */
export const LOCALE_LABELS: Record<Locale, string> = {
  "en-GB": "English",
  "hu-HU": "Magyar",
  "nan-TW": "臺語",
  "zh-TW": "繁體中文"
}
