import type { ListCatalogResponse, ListUserPackagesResponse, PackageType } from "@kaja/schema/api"
import { listCatalogResponseSchema, listUserPackagesResponseSchema } from "@kaja/schema/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"

export const CATALOG_QUERY_KEY = ["packages", "catalog"]
export const MY_PACKAGES_QUERY_KEY = ["packages", "me"]

/** The public catalog (skills and HTTP tools anyone can enable). */
export function useCatalog() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: () => apiFetch<ListCatalogResponse>("/packages").then(r => listCatalogResponseSchema.parse(r).packages)
  })
}

/** Catalog skills only (what a widget key can pick). */
export function useSkillCatalog() {
  const catalog = useCatalog()
  return { ...catalog, data: catalog.data?.filter(pkg => pkg.type === "skill") }
}

/** The signed-in user's selections, which packages have a saved key, and whether keys can be saved at all. */
export function useMyPackages() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: MY_PACKAGES_QUERY_KEY,
    queryFn: () => apiFetch<ListUserPackagesResponse>("/packages/me").then(r => listUserPackagesResponseSchema.parse(r))
  })
}

/** Turns a package on or off for the signed-in user (saved immediately, with a toast). */
export function useTogglePackage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ type, name, on }: { type: PackageType; name: string; on: boolean }) =>
      apiFetch(`/packages/me/${type}/${encodeURIComponent(name)}`, undefined, { method: on ? "PUT" : "DELETE" }),
    onSuccess: (_, { name, on }) => {
      queryClient.invalidateQueries({ queryKey: MY_PACKAGES_QUERY_KEY })
      toast.success(on ? m.skills_turned_on({ name }) : m.skills_turned_off({ name }))
    },
    onError: (err: Error) => toast.error(err.message || m.skills_error_toggle())
  })
}
