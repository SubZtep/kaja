import { useLoaderData } from "@tanstack/react-router"
import { useCallback } from "react"

// Signed in by the session cookie alone: a bearer token would cost an extra /auth/get-session round trip per call
async function apiFetch<T = unknown>(
  apiUrl: string,
  path: string,
  payload?: unknown,
  options?: RequestInit
): Promise<T> {
  const { headers: initHeaders, ...rest } = options ?? {}
  const headers = new Headers(initHeaders)
  headers.set("Content-Type", "application/json")

  const response = await fetch(new URL(path, apiUrl), {
    credentials: "include",
    method: payload === undefined ? "GET" : "POST",
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    ...rest
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => undefined)
    const message = typeof errorBody?.error === "string" ? errorBody.error : response.statusText
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

/** Bound `apiFetch` using the current API base URL; the browser sends the session cookie. */
export function useApiFetch() {
  const { apiUrl } = useLoaderData({ from: "__root__" })

  return useCallback(
    <T = unknown>(path: string, payload?: unknown, options?: RequestInit) =>
      apiFetch<T>(apiUrl, path, payload, options),
    [apiUrl]
  )
}
