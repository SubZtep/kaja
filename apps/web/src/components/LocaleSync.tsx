import type { Locale } from "@kaja/shared"
import * as Sentry from "@sentry/tanstackstart-react"
import { useMatch } from "@tanstack/react-router"
import { useEffect } from "react"
import { useAuthClient } from "../hooks/auth-client"
import { getLocale, setLocale } from "../paraglide/runtime.js"

/** Keeps a signed-in user's saved language and this browser's in step: a saved one wins (switching the page to it), and an account without one saves the current. */
export function LocaleSync() {
  // Not `useLoaderData`: the shell also renders when the root loader failed, and then there's no session to sync.
  const saved = useMatch({ from: "__root__", shouldThrow: false })?.loaderData?.session?.user
  if (!saved) return null
  return <Sync userId={saved.id} locale={saved.locale ?? null} />
}

function Sync({ userId, locale }: Readonly<{ userId: string; locale: Locale | null }>) {
  const authClient = useAuthClient()

  useEffect(() => {
    if (locale) {
      if (locale !== getLocale()) setLocale(locale)
      return
    }
    authClient.updateUser({ locale: getLocale() }).then(({ error }) => {
      if (error) Sentry.captureException(new Error(`Failed to save the locale: ${error.message ?? error.statusText}`))
    })
  }, [authClient, userId, locale])

  return null
}
