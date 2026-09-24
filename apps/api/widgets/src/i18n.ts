import { type Locale, matchLocale } from "@kaja/shared"
import enGb from "../locales/en-GB.toml"
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

const dictionaries: Record<Locale, Record<string, string>> = {
  "en-GB": enGb,
  "hu-HU": huHu,
  "nan-TW": nanTw,
  "zh-TW": zhTw
}

/** The embedding page's language (`<html lang>`), else the visitor's browser's, else en-GB. */
export function widgetLocale(): Locale {
  return matchLocale(document.documentElement.lang) ?? matchLocale(navigator.language) ?? "en-GB"
}

/** The widget's strings in one language, each falling back to en-GB. */
export function widgetStrings(locale: Locale): WidgetStrings {
  const dictionary = dictionaries[locale]
  return Object.fromEntries(KEYS.map(key => [key, dictionary[key] ?? enGb[key] ?? key])) as WidgetStrings
}
