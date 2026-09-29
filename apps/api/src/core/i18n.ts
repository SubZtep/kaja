// Server-side strings for what the API says itself (emails, the Telegram bot). The language is per call, from the user's saved locale, never a global.

import { baseLocale, createMessages, type Locale, locales } from "@kaja/shared/locale"
import enGb from "../../locales/en-GB.toml"
import enUs from "../../locales/en-US.toml"
import huHu from "../../locales/hu-HU.toml"
import nanTw from "../../locales/nan-TW.toml"
import zhTw from "../../locales/zh-TW.toml"

export type Translate = (key: string, params?: Record<string, string | number>) => string

// Bundlers only inline static imports, so each locale file is listed here once; the type keeps the list complete.
const files: Record<Locale, Record<string, unknown>> = {
  "en-GB": enGb,
  "en-US": enUs,
  "hu-HU": huHu,
  "nan-TW": nanTw,
  "zh-TW": zhTw
}

const messages = createMessages(files)

// Exported for the key-parity test.
export const dictionaries = messages.dictionaries

/** A saved or requested language as a supported locale, else en-GB. */
export function toLocale(value: unknown): Locale {
  return locales.find(locale => locale === value) ?? baseLocale
}

/** Dictionary lookup in one language with `{param}` interpolation; falls back to en-GB, then to the key. */
export function translator(locale: unknown): Translate {
  const language = toLocale(locale)
  return (key, params) => messages.translate(language, key, params)
}
