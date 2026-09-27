import { cn } from "@kaja/shared/ui"
import { useLoaderData } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"

// The one action the API's captcha plugin expects from every auth surface.
const ACTION = "auth"
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

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

/** A page's Turnstile state; `ready` is true once a token is in hand, or always when no site key is configured. */
export type Captcha = {
  siteKey: string | undefined
  ready: boolean
  /** Better Auth `fetchOptions` carrying the token (spread into a client call). */
  fetchOptions: { headers: Record<string, string> } | undefined
  /** Tokens are single-use: call after every request that sent one. */
  reset: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
  widgetId: React.RefObject<string | null>
  setToken: (token: string | null) => void
}

/** One Turnstile widget per page, shared by every auth action on it; render it with `<Turnstile captcha={…} />`. */
export function useTurnstile(): Captcha {
  const { turnstileSiteKey: siteKey } = useLoaderData({ from: "__root__" })
  const [token, setToken] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetId = useRef<string | null>(null)

  const reset = useCallback(() => {
    setToken(null)
    if (widgetId.current) window.turnstile?.reset(widgetId.current)
  }, [])

  return {
    siteKey,
    ready: !siteKey || !!token,
    fetchOptions: token ? { headers: { "x-captcha-response": token } } : undefined,
    reset,
    containerRef,
    widgetId,
    setToken
  }
}

/** Renders the page's Turnstile widget; nothing when no site key is configured. */
export function Turnstile({ captcha, className }: Readonly<{ captcha: Captcha; className?: string }>) {
  const { siteKey, containerRef, widgetId, setToken } = captcha

  useEffect(() => {
    const element = containerRef.current
    if (!siteKey || !element) return
    let cancelled = false
    loadTurnstile()
      .then(turnstile => {
        if (cancelled) return
        widgetId.current = turnstile.render(element, {
          sitekey: siteKey,
          action: ACTION,
          theme: "auto",
          size: "flexible",
          callback: setToken,
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null)
        })
      })
      .catch(() => setToken(null))
    return () => {
      cancelled = true
      if (widgetId.current) window.turnstile?.remove(widgetId.current)
      widgetId.current = null
    }
  }, [siteKey, containerRef, widgetId, setToken])

  if (!siteKey) return null
  return <div ref={containerRef} className={cn("min-h-[65px] w-full max-w-sm", className)} />
}
