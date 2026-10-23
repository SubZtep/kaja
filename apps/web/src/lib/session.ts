import { SSR_CLIENT_IP_HEADER, SSR_SECRET_HEADER } from "@kaja/schema/api"
import type { Locale } from "@kaja/shared/locale"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import type { Session } from "better-auth"
import type { UserWithRole } from "better-auth/plugins"
import { env } from "../env/server"

export type SessionData = { session: Session; user: UserWithRole & { locale?: Locale | null } }

// Client navigations and hover preloads all ask for the session; one lookup a minute is plenty
const BROWSER_SESSION_TTL_MS = 60_000

let cached: { at: number; data: Promise<SessionData | null> } | undefined

async function readSession(res: Response): Promise<SessionData | null> {
  if (res.status === 401 || res.status === 204) return null
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status} ${res.statusText}`)
  return res.json() as Promise<SessionData | null>
}

const getSessionOnServer = createServerFn({ method: "GET" }).handler(async () => {
  const apiUrl = env.API_URL || env.VITE_API_URL

  const headers = getRequestHeaders()
  const cookie = headers.get("cookie") ?? ""
  const clientIp = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")

  // The API sees this server's IP, not the visitor's; the shared secret lets it rate-limit per visitor instead
  const res = await fetch(`${apiUrl}/auth/get-session`, {
    method: "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
      ...(clientIp && env.SSR_SECRET ? { [SSR_SECRET_HEADER]: env.SSR_SECRET, [SSR_CLIENT_IP_HEADER]: clientIp } : {})
    },
    credentials: "include"
  })
  return readSession(res)
})

/**
 * The signed-in session, or null. On the server it goes through the API with the visitor's cookie; in the browser it
 * asks the API directly (so the API sees the visitor's own IP) and reuses the answer for a minute.
 */
export function getSession(apiUrl: string): Promise<SessionData | null> {
  if (import.meta.env.SSR) return getSessionOnServer()
  if (cached && Date.now() - cached.at < BROWSER_SESSION_TTL_MS) return cached.data
  const data = fetch(`${apiUrl}/auth/get-session`, { credentials: "include" }).then(readSession)
  cached = { at: Date.now(), data }
  // A failed lookup isn't kept, so the next navigation tries again
  data.catch(() => {
    if (cached?.data === data) cached = undefined
  })
  return data
}

/** Drops the browser's cached session; call it before `router.invalidate()` after the session or user changed. */
export function forgetSession() {
  cached = undefined
}
