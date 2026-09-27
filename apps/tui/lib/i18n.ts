// Static i18n: every dictionary loads at import, and the active language is set at startup (cli.ts, from preferences.locale). The setup wizard switches it mid-run, the moment its first question is answered, so the rest of its steps are readable. Nothing else switches live — a language change takes effect on the next launch.

import { baseLocale, flattenMessages, formatMessage, type Locale, locales, matchLocale } from "@kaja/shared/locale"
import * as z from "zod"
import enGb from "../locales/en-GB.toml"
import enUs from "../locales/en-US.toml"
import huHu from "../locales/hu-HU.toml"
import nanTw from "../locales/nan-TW.toml"
import zhTw from "../locales/zh-TW.toml"

export type Language = Locale

// Bundlers only inline static imports, so each locale file is listed here once; the type keeps the list complete.
const files: Record<Locale, Record<string, unknown>> = {
  "en-GB": enGb,
  "en-US": enUs,
  "hu-HU": huHu,
  "nan-TW": nanTw,
  "zh-TW": zhTw
}

// Exported for the key-parity test.
export const dictionaries = Object.fromEntries(
  locales.map(locale => [locale, flattenMessages(files[locale])])
) as Record<Language, Map<string, string>>

let language: Language = baseLocale

export function getLanguage() {
  return language
}

/** System locale (`hu_HU.UTF-8`) → supported language, matched like any other language tag (`matchLocale`), else en-GB. */
export function detectLanguage(): Language {
  const locale =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  // Drop the codeset and modifier (`.UTF-8`, `@euro`) so only the language and region are matched
  return matchLocale(locale.split(/[.@]/)[0]) ?? baseLocale
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

/** Dictionary lookup with `{param}` interpolation; falls back to en-GB, then to the key. */
export function t(key: string, params?: Record<string, string | number>) {
  return formatMessage(dictionaries[language].get(key) ?? dictionaries[baseLocale].get(key) ?? key, params)
}
