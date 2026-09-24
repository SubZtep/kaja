import type { Locale } from "@kaja/shared"
import { type Translate, toLocale, translator } from "../../core/i18n"

/** A reply's language: the locale for the agent's own replies, and the bot's strings in it. */
export type BotLanguage = { locale: Locale; t: Translate }

/** A Telegram app's `language_code` (IETF, e.g. "hu", "zh-hant") as a supported locale: any Chinese is zh-TW, the only Chinese there is, else en-GB. */
export function localeFromTelegram(code: string | undefined): Locale {
  const lower = code?.toLowerCase() ?? ""
  if (lower.startsWith("hu")) return "hu-HU"
  if (lower.startsWith("nan")) return "nan-TW"
  if (lower.startsWith("zh")) return "zh-TW"
  return "en-GB"
}

/** The account's saved language when it has one, else the Telegram app's (someone not linked yet has only that). */
export function botLanguage(saved: string | null | undefined, telegramCode: string | undefined): BotLanguage {
  const locale = saved ? toLocale(saved) : localeFromTelegram(telegramCode)
  return { locale, t: translator(locale) }
}
