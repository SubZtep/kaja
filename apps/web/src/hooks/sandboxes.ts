import { mySandboxesResponseSchema } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { useApiFetch } from "../lib/api-fetch"

export const MY_SANDBOXES_QUERY_KEY = ["sandbox", "mine"]

/** The user's own sandboxes and sandbox settings; one cache entry shared by the Sandboxes page and the Home card. */
export function useMySandboxes(refetchInterval?: number) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: MY_SANDBOXES_QUERY_KEY,
    queryFn: () => apiFetch("/sandbox").then(r => mySandboxesResponseSchema.parse(r)),
    refetchInterval
  })
}
