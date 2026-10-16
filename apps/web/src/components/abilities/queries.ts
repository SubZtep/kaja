import type { ListAbilityKeysResponse } from "@kaja/schema/api"
import { listAbilityKeysResponseSchema } from "@kaja/schema/api"
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"

/** Whose keys a list and its dialog manage: the signed-in user's own, or the server-wide ones (admins only). */
export type KeyScope = "user" | "service"

const SCOPES = {
  user: { list: "/abilities/me", keys: "/abilities/me/keys", queryKey: ["abilities", "keys"] },
  service: { list: "/admin/abilities/keys", keys: "/admin/abilities/keys", queryKey: ["abilities", "service-keys"] }
} as const

export const ABILITY_KEYS_QUERY_KEY = [...SCOPES.user.queryKey]

/** Where an ability's key is saved or removed in `scope`. */
export function keyPath(scope: KeyScope, name: string) {
  return `${SCOPES[scope].keys}/${encodeURIComponent(name)}`
}

/** Refetches both lists: a server-wide key changes whether users still need their own. */
export function invalidateAbilityKeys(queryClient: QueryClient) {
  for (const { queryKey } of Object.values(SCOPES)) queryClient.invalidateQueries({ queryKey: [...queryKey] })
}

/** The abilities that take a key, whether one is saved in `scope`, and whether keys can be saved at all. */
export function useAbilityKeys(scope: KeyScope = "user") {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: [...SCOPES[scope].queryKey],
    queryFn: () =>
      apiFetch<ListAbilityKeysResponse>(SCOPES[scope].list).then(r => listAbilityKeysResponseSchema.parse(r))
  })
}

/** Removes an ability's key in `scope` (with a toast). */
export function useRemoveAbilityKey(scope: KeyScope = "user") {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => apiFetch(keyPath(scope, name), undefined, { method: "DELETE" }),
    onSuccess: (_, name) => {
      invalidateAbilityKeys(queryClient)
      toast.success(m.tools_key_removed({ name }))
    },
    onError: (err: Error) => toast.error(err.message || m.tools_key_error())
  })
}
