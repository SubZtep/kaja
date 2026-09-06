import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import type { Session } from "better-auth"
import type { UserWithRole } from "better-auth/plugins"
import { env } from "../env/server"

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const apiUrl = env.API_URL || env.VITE_API_URL

  const headers = getRequestHeaders()
  const cookie = headers.get("cookie") ?? ""
  const forwardedFor = headers.get("x-forwarded-for") ?? headers.get("x-real-ip")

  const res = await fetch(`${apiUrl}/auth/get-session`, {
    method: "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {})
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
