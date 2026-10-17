import type { ListAbilityKeysResponse } from "@kaja/schema/api"
import { listAbilityKeysResponseSchema } from "@kaja/schema/api"
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"

// The server-wide ability keys (admins only): every user shares them.
const KEYS_PATH = "/admin/abilities/keys"
const QUERY_KEY = ["abilities", "service-keys"]

/** Where an ability's server-wide key is saved or removed. */
export function keyPath(name: string) {
  return `${KEYS_PATH}/${encodeURIComponent(name)}`
}

/** Refetches the server-wide keys list. */
export function invalidateAbilityKeys(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: QUERY_KEY })
}

/** The abilities that take a key, whether a server-wide one is saved, and whether keys can be saved at all. */
export function useAbilityKeys() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<ListAbilityKeysResponse>(KEYS_PATH).then(r => listAbilityKeysResponseSchema.parse(r))
  })
}

/** Removes an ability's server-wide key (with a toast). */
export function useRemoveAbilityKey() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => apiFetch(keyPath(name), undefined, { method: "DELETE" }),
    onSuccess: (_, name) => {
      invalidateAbilityKeys(queryClient)
      toast.success(m.tools_key_removed({ name }))
    },
    onError: (err: Error) => toast.error(err.message || m.tools_key_error())
  })
}
