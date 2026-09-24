import { type Locale, locales } from "@kaja/shared"
import { getApiBaseUrl } from "../config/api-url"
import { getLanguage, setLanguage } from "../i18n"
import { log } from "../logger"
import { loadToken } from "./credentials"

async function postLocale(token: string, locale: Locale): Promise<void> {
  const res = await fetch(new URL("/auth/update-user", getApiBaseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ locale }),
    signal: AbortSignal.timeout(5000)
  })
  if (!res.ok) log.warn("Failed to save the account language", { status: res.status })
}

/** Saves a cloud user's language on their account, like the web's language picker, so the web, Telegram and emails follow it. Signed out, it does nothing (and a failure only logs): the local setting still applies. */
export async function saveAccountLocale(locale: Locale): Promise<void> {
  try {
    const token = await loadToken()
    if (token) await postLocale(token, locale)
  } catch (error) {
    log.warn("Failed to save the account language", { error })
  }
}

/** Right after a device login: the account's saved language wins and becomes this terminal's (from this run on); an account without one gets the terminal's. A failure only logs. */
export async function syncLocaleAfterLogin(token: string): Promise<void> {
  try {
    const res = await fetch(new URL("/auth/get-session", getApiBaseUrl()), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) {
      log.warn("Failed to read the account language", { status: res.status })
      return
    }
    const saved = ((await res.json()) as { user?: { locale?: unknown } } | null)?.user?.locale
    const locale = locales.find(supported => supported === saved)
    if (!locale) {
      await postLocale(token, getLanguage())
      return
    }
    if (locale === getLanguage()) return
    const { savePreferences } = await import("../config/config")
    await savePreferences({ locale })
    setLanguage(locale)
  } catch (error) {
    log.warn("Failed to sync the account language", { error })
  }
}
