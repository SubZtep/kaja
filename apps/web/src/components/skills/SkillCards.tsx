import type { CatalogPackage, ListCatalogResponse, ListUserPackagesResponse, SkillDetail } from "@kaja/schema/api"
import { listCatalogResponseSchema, listUserPackagesResponseSchema, skillDetailSchema } from "@kaja/schema/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Checkbox } from "../form/primitives/Checkbox"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"

export const CATALOG_QUERY_KEY = ["packages", "catalog"]
export const MY_PACKAGES_QUERY_KEY = ["packages", "me"]

/** The public skill catalog (what anyone can enable, or give a widget key). */
export function useSkillCatalog() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: () => apiFetch<ListCatalogResponse>("/packages").then(r => listCatalogResponseSchema.parse(r).packages)
  })
}

/** The public skill catalog and the signed-in user's selections, shared by /skills and /welcome. */
export function useSkillPackages() {
  const apiFetch = useApiFetch()
  const catalog = useSkillCatalog()
  const mine = useQuery({
    queryKey: MY_PACKAGES_QUERY_KEY,
    queryFn: () =>
      apiFetch<ListUserPackagesResponse>("/packages/me").then(r => listUserPackagesResponseSchema.parse(r).packages)
  })
  return { catalog, mine }
}

/** The instructions the model reads, fetched only when the card is opened. */
function SkillInstructions({ name }: Readonly<{ name: string }>) {
  const apiFetch = useApiFetch()
  const { data, error, isLoading } = useQuery({
    queryKey: ["packages", "skill", name],
    queryFn: () =>
      apiFetch<SkillDetail>(`/packages/skill/${encodeURIComponent(name)}`).then(r => skillDetailSchema.parse(r))
  })
  if (isLoading) return <Loader />
  if (error || !data) return <ErrorNotice error={error} />
  return (
    <div className="mt-3 border-border border-t pt-3">
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-muted text-xs leading-relaxed">
        {data.instructions}
      </div>
      {data.files.length > 0 && (
        <p className="mt-2 font-mono text-muted text-xs">{m.skills_other_files({ files: data.files.join(", ") })}</p>
      )}
    </div>
  )
}

function SkillCard({
  skill,
  enabled,
  pending,
  onToggle
}: Readonly<{ skill: CatalogPackage; enabled: boolean; pending: boolean; onToggle: (on: boolean) => void }>) {
  const [open, setOpen] = useState(false)
  return (
    <Section className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 font-mono font-semibold text-fg text-sm">{skill.name}</div>
          <p className="m-0 text-[13.5px] text-muted">{skill.description}</p>
        </div>
        <Checkbox
          className="shrink-0"
          checked={enabled}
          disabled={pending}
          aria-label={m.skills_toggle({ name: skill.name })}
          onCheckedChange={onToggle}
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-3 inline-flex cursor-pointer items-center gap-1 text-muted text-xs hover:text-fg"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? m.skills_hide_instructions() : m.skills_show_instructions()}
      </button>
      {open && <SkillInstructions name={skill.name} />}
    </Section>
  )
}

/**
 * Catalog skills as cards with an on/off toggle (saved immediately) and their instructions on
 * demand, followed by any enabled skill that has since left the marketplace, so it can be turned off.
 */
export function SkillCards() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const { catalog, mine } = useSkillPackages()

  const toggle = useMutation({
    mutationFn: ({ name, on }: { name: string; on: boolean }) =>
      apiFetch(`/packages/me/skill/${encodeURIComponent(name)}`, undefined, { method: on ? "PUT" : "DELETE" }),
    onSuccess: (_, { name, on }) => {
      queryClient.invalidateQueries({ queryKey: MY_PACKAGES_QUERY_KEY })
      toast.success(on ? m.skills_turned_on({ name }) : m.skills_turned_off({ name }))
    },
    onError: (err: Error) => toast.error(err.message || m.skills_error_toggle())
  })

  if (catalog.isLoading || mine.isLoading) return <Loader />
  const enabled = new Set((mine.data ?? []).map(p => p.name))
  const unavailable = (mine.data ?? []).filter(p => !p.available)
  const pendingName = toggle.isPending ? toggle.variables?.name : undefined

  return (
    <>
      <ErrorNotice error={catalog.error ?? mine.error} />
      {(catalog.data ?? []).length === 0 ? (
        <Section>
          <p className="m-0 text-muted text-sm">{m.skills_empty()}</p>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(catalog.data ?? []).map(skill => (
            <SkillCard
              key={skill.name}
              skill={skill}
              enabled={enabled.has(skill.name)}
              pending={pendingName === skill.name}
              onToggle={on => toggle.mutate({ name: skill.name, on })}
            />
          ))}
        </div>
      )}

      {unavailable.length > 0 && (
        <Section className="mt-6" title={m.skills_unavailable_title()}>
          <p className="mt-0 mb-4 text-muted text-sm">{m.skills_unavailable_description()}</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {unavailable.map(pkg => (
              <li key={pkg.name} className="flex items-center justify-between gap-3">
                <span className="font-mono text-fg text-sm">{pkg.name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pendingName === pkg.name}
                  onClick={() => toggle.mutate({ name: pkg.name, on: false })}
                >
                  {m.skills_turn_off()}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
