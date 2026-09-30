import { baseLocale, createMessages, type Locale, matchLocale } from "@kaja/shared/locale"
import enGb from "../locales/en-GB.toml"
import enUs from "../locales/en-US.toml"
import huHu from "../locales/hu-HU.toml"
import nanTw from "../locales/nan-TW.toml"
import zhTw from "../locales/zh-TW.toml"

const KEYS = [
  "openChat",
  "askPlaceholder",
  "answerPlaceholder",
  "send",
  "error",
  "rateLimited",
  "answerYes",
  "answerNo",
  "answerSometimes",
  "answerUnknown"
] as const

export type WidgetStrings = Record<(typeof KEYS)[number], string>

// Bundlers only inline static imports, so each locale file is listed here once; the type keeps the list complete.
const messages = createMessages({
  "en-GB": enGb,
  "en-US": enUs,
  "hu-HU": huHu,
  "nan-TW": nanTw,
  "zh-TW": zhTw
})

/** The embedding page's language (`<html lang>`), else the visitor's browser's, else en-GB. */
export function widgetLocale(): Locale {
  return matchLocale(document.documentElement.lang) ?? matchLocale(navigator.language) ?? baseLocale
}

/** The widget's strings in one language, each falling back to en-GB. */
export function widgetStrings(locale: Locale): WidgetStrings {
  return Object.fromEntries(KEYS.map(key => [key, messages.translate(locale, key)])) as WidgetStrings
}
