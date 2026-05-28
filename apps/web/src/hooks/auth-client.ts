import { useLoaderData } from "@tanstack/react-router"
import { createAuthClientWithUrl } from "../lib/auth"

let authClient: ReturnType<typeof createAuthClientWithUrl> | null = null

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
