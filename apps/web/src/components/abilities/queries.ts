import type { ListAbilityKeysResponse } from "@kaja/schema/api"
import { listAbilityKeysResponseSchema } from "@kaja/schema/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"

export const ABILITY_KEYS_QUERY_KEY = ["abilities", "keys"]

/** The abilities that take a key (and some persona uses), whether the signed-in user saved one, and whether keys can be saved at all. */
export function useAbilityKeys() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ABILITY_KEYS_QUERY_KEY,
    queryFn: () => apiFetch<ListAbilityKeysResponse>("/abilities/me").then(r => listAbilityKeysResponseSchema.parse(r))
  })
}

/** Removes the signed-in user's key for an ability (with a toast). */
export function useRemoveAbilityKey() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/abilities/me/keys/${encodeURIComponent(name)}`, undefined, { method: "DELETE" }),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ABILITY_KEYS_QUERY_KEY })
      toast.success(m.tools_key_removed({ name }))
    },
    onError: (err: Error) => toast.error(err.message || m.tools_key_error())
  })
}
