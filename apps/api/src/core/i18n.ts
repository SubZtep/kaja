// Server-side strings for what the API says itself (emails, the Telegram bot). The language is per call, from the user's saved locale, never a global.

import { type Locale, locales } from "@kaja/shared"
import enGb from "../../locales/en-GB.toml"
import enUs from "../../locales/en-US.toml"
import huHu from "../../locales/hu-HU.toml"
import nanTw from "../../locales/nan-TW.toml"
import zhTw from "../../locales/zh-TW.toml"

export type Translate = (key: string, params?: Record<string, string | number>) => string

function flatten(table: Record<string, unknown>, prefix = "", out = new Map<string, string>()) {
  for (const [key, value] of Object.entries(table)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else if (value && typeof value === "object") flatten(value as Record<string, unknown>, path, out)
  }
  return out
}

// Exported for the key-parity test.
export const dictionaries: Record<Locale, Map<string, string>> = {
  "en-GB": flatten(enGb),
  "en-US": flatten(enUs),
  "hu-HU": flatten(huHu),
  "nan-TW": flatten(nanTw),
  "zh-TW": flatten(zhTw)
}

/** A saved or requested language as a supported locale, else en-GB. */
export function toLocale(value: unknown): Locale {
  return locales.find(locale => locale === value) ?? "en-GB"
}

/** Dictionary lookup in one language with `{param}` interpolation; falls back to en-GB, then to the key. */
export function translator(locale: unknown): Translate {
  const dictionary = dictionaries[toLocale(locale)]
  return (key, params) => {
    const template = dictionary.get(key) ?? dictionaries["en-GB"].get(key) ?? key
    return params
      ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
      : template
  }
}
