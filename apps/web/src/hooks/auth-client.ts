import { useLoaderData } from "@tanstack/react-router"
import { createAuthClientWithUrl } from "../lib/auth"

let authClient: ReturnType<typeof createAuthClientWithUrl> | null = null

/** The shared Better Auth client; code that runs on the landing page loads it with `loadAuthClient` instead. */
export function getAuthClient(apiUrl: string) {
  if (!authClient) {
    authClient = createAuthClientWithUrl(apiUrl)
  }
  return authClient
}

export function useAuthClient() {
  const { apiUrl } = useLoaderData({ from: "__root__" })
  return getAuthClient(apiUrl)
}
