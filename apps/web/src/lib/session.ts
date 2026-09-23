import { SSR_CLIENT_IP_HEADER, SSR_SECRET_HEADER } from "@kaja/schema/api"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import type { Session } from "better-auth"
import type { UserWithRole } from "better-auth/plugins"
import { env } from "../env/server"

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
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

  if (res.status === 401 || res.status === 204) {
    return null
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch session: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<{ session: Session; user: UserWithRole }>
})
