import type { AbilityType, ListCatalogResponse, ListUserAbilitiesResponse } from "@kaja/schema/api"
import { listCatalogResponseSchema, listUserAbilitiesResponseSchema } from "@kaja/schema/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"

export const CATALOG_QUERY_KEY = ["abilities", "catalog"]
export const MY_ABILITIES_QUERY_KEY = ["abilities", "me"]

/** The public catalog (skills and HTTP tools anyone can enable). */
export function useCatalog() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: () => apiFetch<ListCatalogResponse>("/abilities").then(r => listCatalogResponseSchema.parse(r).abilities)
  })
}

/** Catalog skills only (what a widget key can pick). */
export function useSkillCatalog() {
  const catalog = useCatalog()
  return { ...catalog, data: catalog.data?.filter(ability => ability.type === "skill") }
}

/** The signed-in user's selections, which abilities have a saved key, and whether keys can be saved at all. */
export function useMyAbilities() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: MY_ABILITIES_QUERY_KEY,
    queryFn: () =>
      apiFetch<ListUserAbilitiesResponse>("/abilities/me").then(r => listUserAbilitiesResponseSchema.parse(r))
  })
}

/** Turns an ability on or off for the signed-in user (saved immediately, with a toast). */
export function useToggleAbility() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, name, on }: { type: AbilityType; name: string; on: boolean }) =>
      apiFetch(`/abilities/me/${type}/${encodeURIComponent(name)}`, undefined, { method: on ? "PUT" : "DELETE" }),
    onSuccess: (_, { name, on }) => {
      queryClient.invalidateQueries({ queryKey: MY_ABILITIES_QUERY_KEY })
      toast.success(on ? m.skills_turned_on({ name }) : m.skills_turned_off({ name }))
    },
    onError: (err: Error) => toast.error(err.message || m.skills_error_toggle())
  })
}
