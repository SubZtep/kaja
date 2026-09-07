// Static i18n: both dictionaries load at import, the active language is set once at startup (cli.tsx, from preferences.language). No live switching — a language change takes effect on the next launch.

import * as z from "zod"
import en from "../locales/en.toml"
import hu from "../locales/hu.toml"
import zhTw from "../locales/zh-TW.toml"

export type Language = "en" | "hu" | "zh-TW"

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
  en: flatten(en),
  hu: flatten(hu),
  "zh-TW": flatten(zhTw)
}

let language: Language = "en"

export function getLanguage() {
  return language
}

/** System locale → supported language: zh-TW for a Taiwan Chinese locale, hu for a Hungarian locale, else en. */
export function detectLanguage(): Language {
  const locale =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  const lower = locale.toLowerCase()
  if (lower.startsWith("zh-tw") || lower.startsWith("zh_tw")) return "zh-TW"
  return lower.startsWith("hu") ? "hu" : "en"
}

// zod's z.locales keys are camelCase (e.g. zhTW), unlike this module's BCP-47-style Language codes.
const ZOD_LOCALE: Record<Language, keyof typeof z.locales> = { en: "en", hu: "hu", "zh-TW": "zhTW" }

export function setLanguage(next: Language) {
  language = next
  // Zod validation messages (wizard field errors) follow along.
  z.config(z.locales[ZOD_LOCALE[next]]())
}

/** Dictionary lookup with `{param}` interpolation; falls back hu → en → key. */
export function t(key: string, params?: Record<string, string | number>) {
  const template = dictionaries[language].get(key) ?? dictionaries.en.get(key) ?? key
  return params
    ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    : template
}
