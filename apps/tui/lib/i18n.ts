// Static i18n: both dictionaries load at import, the active language is set once at startup (cli.ts, from preferences.language). No live switching — a language change takes effect on the next launch.

import * as z from "zod"
import enGb from "../locales/en-GB.toml"
import hu from "../locales/hu.toml"
import nanTw from "../locales/nan-TW.toml"

export type Language = "en-GB" | "hu" | "nan-TW"

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
  hu: flatten(hu),
  "nan-TW": flatten(nanTw)
}

let language: Language = "en-GB"

export function getLanguage() {
  return language
}

/** System locale → supported language: nan-TW for a Taiwanese Hokkien locale, hu for a Hungarian locale, else en-GB. */
export function detectLanguage(): Language {
  const locale =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  const lower = locale.toLowerCase()
  if (lower.startsWith("nan-tw") || lower.startsWith("nan_tw")) return "nan-TW"
  return lower.startsWith("hu") ? "hu" : "en-GB"
}

// zod has no locale file for nan-TW, so validation messages fall back to its default (English).
const ZOD_LOCALE: Record<Language, keyof typeof z.locales> = { "en-GB": "en", hu: "hu", "nan-TW": "en" }

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
