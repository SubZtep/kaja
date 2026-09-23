import { cn } from "@kaja/shared"
import { useState } from "react"
import { toast } from "react-toastify"
import { useAuthClient } from "../../../hooks/auth-client"
import { m } from "../../../paraglide/messages.js"
import { localizeHref } from "../../../paraglide/runtime.js"
import { Sticker } from "./sticker"

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.2 2.8-2.5 3.6v3h4.1c2.4-2.2 3.4-5.4 3.4-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-4.1-3c-1.1.8-2.6 1.2-3.9 1.2-3 0-5.6-2-6.5-4.7H1.3v3.1C3.3 21.4 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 14.6c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V7.1H1.3C.5 8.7 0 10.3 0 12.4c0 2 .5 3.7 1.3 5.3l4.2-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C18 1.1 15.2 0 12 0 7.4 0 3.3 2.6 1.3 6.5l4.2 3.1C6.4 6.8 9 4.8 12 4.8z"
      />
    </svg>
  )
}

/**
 * Starts the Google OAuth flow via the API; on success Better Auth redirects back to `callbackPath` on this origin.
 * Only `signUp` (the sign-up page, after its consent boxes) may create a new account; elsewhere an unknown Google address comes back to /signin with `error=signup_disabled`.
 */
export function GoogleButton({
  className,
  callbackPath = "/dashboard",
  signUp = false,
  disabled = false
}: Readonly<{ className?: string; callbackPath?: string; signUp?: boolean; disabled?: boolean }>) {
  const authClient = useAuthClient()
  const [loading, setLoading] = useState(false)

  const signIn = async () => {
    setLoading(true)
    try {
      // absolute URLs: a relative one would resolve against the API origin
      const { origin } = window.location
      const { error: authError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(localizeHref(callbackPath), origin).toString(),
        errorCallbackURL: new URL(localizeHref(signUp ? "/signup" : "/signin"), origin).toString(),
        ...(signUp ? { requestSignUp: true, additionalData: { consent: true } } : {})
      })
      if (authError) {
        toast.error(authError.message ?? m.signin_error_generic())
        setLoading(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.signin_error_generic())
      setLoading(false)
    }
  }

  return (
    <div className={cn("relative inline-flex w-full max-w-sm overflow-visible pt-3", className)}>
      <button
        type="button"
        disabled={loading || disabled}
        className="tape-btn flex w-full cursor-pointer items-center justify-center gap-2 px-5 py-3 disabled:opacity-60"
        onClick={signIn}
      >
        <GoogleMark />
        {m.google_continue()}
      </button>
      <Sticker rotate={12} className="pointer-events-none absolute -top-3 -right-2 px-2 py-1">
        {m.stamp_beta()}
      </Sticker>
    </div>
  )
}
