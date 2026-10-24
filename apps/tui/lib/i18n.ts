// Static i18n: every dictionary loads at import, and the active language is set at startup (cli.ts, from preferences.locale). The setup wizard switches it mid-run, the moment its first question is answered, so the rest of its steps are readable. Nothing else switches live — a language change takes effect on the next launch.

import { baseLocale, createMessages, type Locale, matchLocale } from "@kaja/shared/locale"
import * as z from "zod"
import deDe from "../locales/de-DE.toml"
import enGb from "../locales/en-GB.toml"
import enUs from "../locales/en-US.toml"
import esEs from "../locales/es-ES.toml"
import frFr from "../locales/fr-FR.toml"
import huHu from "../locales/hu-HU.toml"
import jaJp from "../locales/ja-JP.toml"
import koKr from "../locales/ko-KR.toml"
import nanTw from "../locales/nan-TW.toml"
import ptBr from "../locales/pt-BR.toml"
import zhTw from "../locales/zh-TW.toml"

export type Language = Locale

// Bundlers only inline static imports, so each locale file is listed here once; the type keeps the list complete.
const files: Record<Locale, Record<string, unknown>> = {
  "en-GB": enGb,
  "en-US": enUs,
  "hu-HU": huHu,
  "nan-TW": nanTw,
  "zh-TW": zhTw,
  "es-ES": esEs,
  "ja-JP": jaJp,
  "ko-KR": koKr,
  "de-DE": deDe,
  "fr-FR": frFr,
  "pt-BR": ptBr
}

const messages = createMessages(files)

// Exported for the key-parity test.
export const dictionaries = messages.dictionaries

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

// Zod has no Taiwanese Hokkien locale, so validation messages fall back to English there.
const ZOD_LOCALE: Record<Language, keyof typeof z.locales> = {
  "en-GB": "en",
  "en-US": "en",
  "hu-HU": "hu",
  "nan-TW": "en",
  "zh-TW": "zhTW",
  "es-ES": "es",
  "ja-JP": "ja",
  "ko-KR": "ko",
  "de-DE": "de",
  "fr-FR": "fr",
  "pt-BR": "ptBR"
}

export function setLanguage(next: Language) {
  language = next
  // Zod validation messages (wizard field errors) follow along.
  z.config(z.locales[ZOD_LOCALE[next]]())
}

/** Dictionary lookup with `{param}` interpolation; falls back to en-GB, then to the key. */
export function t(key: string, params?: Record<string, string | number>) {
  return messages.translate(language, key, params)
}
