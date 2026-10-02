import { useLoaderData } from "@tanstack/react-router"
import { useCallback } from "react"
import { loadAuthClient } from "../hooks/load-auth-client"
import { captureError } from "./sentry"

async function apiFetch<T = unknown>(
  apiUrl: string,
  getAccessToken: () => Promise<string | null>,
  path: string,
  payload?: unknown,
  options?: RequestInit
): Promise<T> {
  const url = new URL(path, apiUrl).toString()
  const { headers: initHeaders, ...rest } = options ?? {}
  const headers = new Headers(initHeaders)
  headers.set("Content-Type", "application/json")
  const token = await getAccessToken()
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  let body: BodyInit | undefined
  if (payload) {
    try {
      body = JSON.stringify(payload)
    } catch (err) {
      captureError(err)
    }
  }

  const response = await fetch(url, {
    credentials: "include",
    method: payload === undefined ? "GET" : "POST",
    headers,
    body,
    ...rest
  })

  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
    const message = typeof body?.error === "string" ? body.error : response.statusText
    throw new Error(message)
  }

  return response.json()
}

/** Bound `apiFetch` using the current API base URL and Better Auth session token. */
export function useApiFetch() {
  const { apiUrl, session } = useLoaderData({ from: "__root__" })
  const signedIn = Boolean(session)

  return useCallback(
    <T = unknown>(path: string, payload?: unknown, options?: RequestInit) =>
      apiFetch<T>(
        apiUrl,
        async () => {
          // A visitor has no token, so public calls (the landing's) skip the auth client and its session lookup
          if (!signedIn) return null
          const authClient = await loadAuthClient(apiUrl)
          return (await authClient.getSession()).data?.session?.token ?? null
        },
        path,
        payload,
        options
      ),
    [apiUrl, signedIn]
  )
}
