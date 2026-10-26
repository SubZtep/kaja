import { useLoaderData } from "@tanstack/react-router"
import { getAuthClient } from "../lib/auth"

export function useAuthClient() {
  const { apiUrl } = useLoaderData({ from: "__root__" })
  return getAuthClient(apiUrl)
}
