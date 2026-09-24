import type { Locale } from "@kaja/shared"
import { useMatch, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"
import { getLocale, setLocale } from "../paraglide/runtime.js"

/** The device pages keep the language of the link the TUI opened (it saves that on the account once approved); `pathname` is the router's de-localized one. */
export function keepsLinkLanguage(pathname: string): boolean {
  return pathname.startsWith("/device")
}

/** A signed-in user's saved language wins: the page switches to it. Viewing a page never saves one — only a choice does (the picker, sign-up, the TUI) — so an account without one keeps whichever language each page is in. The device pages are left alone: the TUI opens them in its own language, and saves that on the account once the login is approved. */
export function LocaleSync() {
  // Not `useLoaderData`: the shell also renders when the root loader failed, and then there's no session to sync.
  const saved: Locale | null | undefined = useMatch({ from: "__root__", shouldThrow: false })?.loaderData?.session?.user
    .locale

  const onDevicePage = useRouterState({ select: state => keepsLinkLanguage(state.location.pathname) })

  useEffect(() => {
    if (saved && !onDevicePage && saved !== getLocale()) setLocale(saved)
  }, [saved, onDevicePage])

  return null
}
