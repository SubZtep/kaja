// Static i18n: every dictionary loads at import, and the active language is set at startup (cli.ts, from preferences.locale). The setup wizard switches it mid-run, the moment its first question is answered, so the rest of its steps are readable. Nothing else switches live — a language change takes effect on the next launch.

import type { Locale } from "@kaja/shared"
import * as z from "zod"
import enGb from "../locales/en-GB.toml"
import enUs from "../locales/en-US.toml"
import huHu from "../locales/hu-HU.toml"
import nanTw from "../locales/nan-TW.toml"
import zhTw from "../locales/zh-TW.toml"

export type Language = Locale

function flatten(table: Record<string, unknown>, prefix = "", out = new Map<string, string>()) {
  for (const [key, value] of Object.entries(table)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else if (value && typeof value === "object") flatten(value as Record<string, unknown>, path, out)
  }
  return out
}

// Exported for the key-parity test.
export const dictionaries: Record<Language, Map<string, string>> = {
  "en-GB": flatten(enGb),
  "en-US": flatten(enUs),
  "hu-HU": flatten(huHu),
  "nan-TW": flatten(nanTw),
  "zh-TW": flatten(zhTw)
}

let language: Language = "en-GB"

export function getLanguage() {
  return language
}

/** System locale → supported language: en-US for a US English locale, nan-TW for a Taiwanese Hokkien locale, zh-TW for a Traditional Chinese one, hu-HU for a Hungarian locale, else en-GB. */
export function detectLanguage(): Language {
  const locale =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  const lower = locale.toLowerCase()
  if (lower.startsWith("nan-tw") || lower.startsWith("nan_tw")) return "nan-TW"
  if (lower.startsWith("en-us") || lower.startsWith("en_us")) return "en-US"
  if (lower.startsWith("zh-tw") || lower.startsWith("zh_tw")) return "zh-TW"
  return lower.startsWith("hu") ? "hu-HU" : "en-GB"
}

// zod has no locale file for nan-TW, so validation messages fall back to its default (English).
const ZOD_LOCALE: Record<Language, keyof typeof z.locales> = {
  "en-GB": "en",
  "en-US": "en",
  "hu-HU": "hu",
  "nan-TW": "en",
  "zh-TW": "zhTW"
}

export function setLanguage(next: Language) {
  language = next
  // Zod validation messages (wizard field errors) follow along.
  z.config(z.locales[ZOD_LOCALE[next]]())
}

/** Dictionary lookup with `{param}` interpolation; falls back hu → en → key. */
export function t(key: string, params?: Record<string, string | number>) {
  const template = dictionaries[language].get(key) ?? dictionaries["en-GB"].get(key) ?? key
  return params
    ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    : template
}
