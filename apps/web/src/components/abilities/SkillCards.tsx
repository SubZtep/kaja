import type { CatalogAbility, SkillDetail } from "@kaja/schema/api"
import { skillDetailSchema } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { useCatalog, useMyAbilities, useToggleAbility } from "./queries"
import { UnavailableAbilities } from "./UnavailableAbilities"

/** The instructions the model reads, fetched only when the card is opened. */
function SkillInstructions({ name }: Readonly<{ name: string }>) {
  const apiFetch = useApiFetch()
  const { data, error, isLoading } = useQuery({
    queryKey: ["abilities", "skill", name],
    queryFn: () =>
      apiFetch<SkillDetail>(`/abilities/skill/${encodeURIComponent(name)}`).then(r => skillDetailSchema.parse(r))
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
}: Readonly<{ skill: CatalogAbility; enabled: boolean; pending: boolean; onToggle: (on: boolean) => void }>) {
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
  const catalog = useCatalog()
  const mine = useMyAbilities()
  const toggle = useToggleAbility()

  if (catalog.isLoading || mine.isLoading) return <Loader />
  const skills = (catalog.data ?? []).filter(ability => ability.type === "skill")
  const enabled = new Set((mine.data?.abilities ?? []).filter(p => p.type === "skill").map(p => p.name))
  const pendingName = toggle.isPending ? toggle.variables?.name : undefined

  return (
    <>
      <ErrorNotice error={catalog.error ?? mine.error} />
      {skills.length === 0 ? (
        <Section>
          <p className="m-0 text-muted text-sm">{m.skills_empty()}</p>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {skills.map(skill => (
            <SkillCard
              key={skill.name}
              skill={skill}
              enabled={enabled.has(skill.name)}
              pending={pendingName === skill.name}
              onToggle={on => toggle.mutate({ type: "skill", name: skill.name, on })}
            />
          ))}
        </div>
      )}
      <UnavailableAbilities types={["skill"]} />
    </>
  )
}
