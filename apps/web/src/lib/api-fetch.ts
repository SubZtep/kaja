import { error } from "@kaja/logger"
import { useLoaderData } from "@tanstack/react-router"
import { useCallback } from "react"
import { useAuthClient } from "../hooks/auth-client"

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
      error("API request error", { error: err })
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
    error("API requiest failed", { path, response })
    throw new Error(response.statusText)
  }

  return response.json()
}

/** Bound `apiFetch` using the current API base URL and Better Auth session token. */
export function useApiFetch() {
  const { apiUrl } = useLoaderData({ from: "__root__" })
  const authClient = useAuthClient()

  return useCallback(
    <T = unknown>(path: string, payload?: unknown, options?: RequestInit) =>
      apiFetch<T>(
        apiUrl,
        async () => (await authClient.getSession()).data?.session?.token ?? null,
        path,
        payload,
        options
      ),
    [apiUrl, authClient]
  )
}
