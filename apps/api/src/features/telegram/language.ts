import { type Locale, matchLocale } from "@kaja/shared"
import { type Translate, toLocale, translator } from "../../core/i18n"

/** A reply's language: the locale for the agent's own replies, and the bot's strings in it. */
export type BotLanguage = { locale: Locale; t: Translate }

/** A Telegram app's `language_code` (IETF, e.g. "hu", "zh-hant") as a supported locale, else en-GB. */
export function localeFromTelegram(code: string | undefined): Locale {
  return matchLocale(code) ?? "en-GB"
}

/** The account's saved language when it has one, else the Telegram app's (someone not linked yet has only that). */
export function botLanguage(saved: string | null | undefined, telegramCode: string | undefined): BotLanguage {
  const locale = saved ? toLocale(saved) : localeFromTelegram(telegramCode)
  return { locale, t: translator(locale) }
}
