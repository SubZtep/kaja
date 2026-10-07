import { Fieldset } from "@base-ui/react/fieldset"
import { useLoaderData } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { Flip, toast } from "react-toastify"
import { Button } from "../components/form/primitives/Button"
import { m } from "../paraglide/messages.js"

// The one action the API's captcha plugin expects from every auth surface.
const ACTION = "auth"
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
// An invisible check passes in a second or two; this long without a token it's stuck (blocked script, flaky network).
const STUCK_MS = 30_000
// Most checks pass within this; only a slower one earns a "checking" toast, so a quick pass doesn't flash it.
const SLOW_MS = 1_000
const CHECKING_TOAST = "captcha-checking"
const FAILED_TOAST = "captcha-failed"
// Where the widget lives: an Invisible-mode key shows nothing, any other mode shows its box in this corner.
const HOST_CLASS = "fixed right-4 bottom-4 z-50"

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      action: string
      theme?: "auto" | "light" | "dark"
      size?: "normal" | "flexible" | "compact"
      callback: (token: string) => void
      "expired-callback": () => void
      "error-callback": () => void
      "timeout-callback": () => void
      "unsupported-callback": () => void
    }
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

// Loads Cloudflare's script once per page; a failed load can be retried by the next widget.
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")))
    script.onerror = () => {
      scriptPromise = null
      script.remove()
      reject(new Error("Turnstile failed to load"))
    }
    document.head.append(script)
  })
  return scriptPromise
}

/** A page's Turnstile state: its first check gates the page; after that each token-sending call gets a fresh token from a background check. */
export type Captcha = {
  /** The first check has passed (or no site key is configured), and the last one didn't fail. */
  ready: boolean
  /** The first check is still running. */
  checking: boolean
  /** The check errored, timed out, or can't run in this browser; `<CaptchaGate>` says so and offers a retry. */
  failed: boolean
  /** Better Auth `fetchOptions` with a token (spread into a client call): waits for a running check, and starts the next one, as each token is single-use. */
  fetchOptions: () => Promise<{ headers: Record<string, string> } | undefined>
  /** Renders the widget again from scratch (reloading Cloudflare's script if it failed); calls waiting for a token carry on once it passes. */
  retry: () => void
}

/** One Turnstile widget per page, shared by every auth action on it, in its own element on `<body>`; gate the page's controls with `<CaptchaGate captcha={…}>`. */
export function useTurnstile(): Captcha {
  const { turnstileSiteKey: siteKey } = useLoaderData({ from: "__root__" })
  const [token, setToken] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const widgetId = useRef<string | null>(null)
  // The token for reads outside render, and the calls waiting for one (a submit during a background check)
  const tokenRef = useRef<string | null>(null)
  const waiters = useRef<((token: string) => void)[]>([])

  const store = useCallback((next: string | null) => {
    tokenRef.current = next
    setToken(next)
  }, [])

  // A token was handed out: drop it and start the check for the next one.
  const recheck = useCallback(() => {
    store(null)
    if (widgetId.current) window.turnstile?.reset(widgetId.current)
  }, [store])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger, not an input
  useEffect(() => {
    if (!siteKey) return
    const host = document.createElement("div")
    host.className = HOST_CLASS
    document.body.append(host)
    let cancelled = false
    const fail = () => {
      store(null)
      setFailed(true)
    }
    loadTurnstile()
      .then(turnstile => {
        if (cancelled) return
        widgetId.current = turnstile.render(host, {
          sitekey: siteKey,
          action: ACTION,
          theme: "auto",
          callback: solved => {
            setFailed(false)
            setVerified(true)
            const waiter = waiters.current.shift()
            if (!waiter) return store(solved)
            waiter(solved)
            setTimeout(recheck)
          },
          "expired-callback": () => store(null),
          "error-callback": fail,
          "timeout-callback": fail,
          "unsupported-callback": fail
        })
      })
      .catch(() => {
        if (!cancelled) fail()
      })
    return () => {
      cancelled = true
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
      host.remove()
    }
  }, [siteKey, attempt, store, recheck])

  // The invisible widget shows nothing while it works, so a check that never ends has to surface here.
  useEffect(() => {
    if (!siteKey || token || failed) return
    const timer = setTimeout(() => setFailed(true), STUCK_MS)
    return () => clearTimeout(timer)
  }, [siteKey, token, failed])

  const checking = !!siteKey && !verified && !failed

  // Only the first check shows: later ones run while the page stays usable. A loading toast can't be closed by hand; it goes when the check ends either way.
  useEffect(() => {
    if (!checking) return
    const timer = setTimeout(
      () =>
        toast.loading(m.auth_captcha_checking(), {
          toastId: CHECKING_TOAST,
          transition: Flip,
          className: "opacity-90"
        }),
      SLOW_MS
    )
    return () => {
      clearTimeout(timer)
      toast.dismiss(CHECKING_TOAST)
    }
  }, [checking])

  useEffect(() => {
    if (!siteKey || !failed) return
    toast.error(m.auth_captcha_failed_toast(), { toastId: FAILED_TOAST })
    return () => toast.dismiss(FAILED_TOAST)
  }, [siteKey, failed])

  const fetchOptions = useCallback(async () => {
    if (!siteKey) return undefined
    let solved = tokenRef.current
    if (solved) recheck()
    else solved = await new Promise<string>(resolve => waiters.current.push(resolve))
    return { headers: { "x-captcha-response": solved } }
  }, [siteKey, recheck])

  const retry = useCallback(() => {
    store(null)
    setFailed(false)
    setAttempt(n => n + 1)
  }, [store])

  return {
    ready: !siteKey || (verified && !failed),
    checking,
    failed: !!siteKey && failed,
    fetchOptions,
    retry
  }
}

/** Disables every field and button inside until the page's Turnstile check passes; on failure, says so above them with a retry. */
export function CaptchaGate({
  captcha,
  className,
  children
}: Readonly<{ captcha: Captcha; className?: string; children: React.ReactNode }>) {
  return (
    <div className={className}>
      {captcha.failed ? (
        <p
          role="alert"
          className="mb-4 rounded-sm border border-amber-800 bg-amber-950/40 px-3 py-2 text-[13.5px] text-amber-200"
        >
          {m.auth_captcha_failed()}{" "}
          <Button size="sm" variant="link" onClick={captcha.retry} className="mx-0 text-[13.5px]">
            {m.auth_captcha_retry()}
          </Button>
        </p>
      ) : null}
      <Fieldset.Root disabled={!captcha.ready} aria-busy={captcha.checking} className="min-w-0">
        {children}
      </Fieldset.Root>
    </div>
  )
}
