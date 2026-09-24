import type { Locale } from "@kaja/shared"
import { useMatch } from "@tanstack/react-router"
import { useEffect } from "react"
import { getLocale, setLocale } from "../paraglide/runtime.js"

/** A signed-in user's saved language wins: the page switches to it. Viewing a page never saves one — only a choice does (the picker, sign-up, the TUI) — so an account without one keeps whichever language each page is in. */
export function LocaleSync() {
  // Not `useLoaderData`: the shell also renders when the root loader failed, and then there's no session to sync.
  const saved: Locale | null | undefined = useMatch({ from: "__root__", shouldThrow: false })?.loaderData?.session?.user
    .locale

  useEffect(() => {
    if (saved && saved !== getLocale()) setLocale(saved)
  }, [saved])

  return null
}
