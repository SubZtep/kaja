import type { Locale } from "@kaja/shared"
import { getApiBaseUrl } from "../config/api-url"
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

/** Saves a cloud user's language on their account, like the web's language picker, so the web, Telegram and emails follow it. Called from the wizard and right after a device login: the terminal a user logs in from is a choice of language. Signed out, it does nothing (and a failure only logs): the local setting still applies. */
export async function saveAccountLocale(locale: Locale): Promise<void> {
  try {
    const token = await loadToken()
    if (token) await postLocale(token, locale)
  } catch (error) {
    log.warn("Failed to save the account language", { error })
  }
}
