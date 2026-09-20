import type { CatalogAbility } from "@kaja/schema/api"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { useCatalog, useMyAbilities, useToggleAbility } from "./queries"
import { UnavailableAbilities } from "./UnavailableAbilities"

function PersonaCard({
  persona,
  enabled,
  pending,
  onToggle
}: Readonly<{ persona: CatalogAbility; enabled: boolean; pending: boolean; onToggle: (on: boolean) => void }>) {
  const [open, setOpen] = useState(false)
  const detail = persona.persona
  return (
    <Section className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 font-semibold text-fg text-sm">
            {detail?.label ?? persona.name}{" "}
            <span className="font-mono font-normal text-muted text-xs">{persona.name}</span>
          </div>
          <p className="m-0 text-[13.5px] text-muted">
            {detail?.when ? m.personas_when({ when: detail.when }) : m.personas_manual_only()}
          </p>
        </div>
        <Checkbox
          className="shrink-0"
          checked={enabled}
          disabled={pending}
          aria-label={m.personas_toggle({ name: detail?.label ?? persona.name })}
          onCheckedChange={onToggle}
        />
      </div>
      {detail?.instructions && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-3 inline-flex cursor-pointer items-center gap-1 text-muted text-xs hover:text-fg"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {open ? m.skills_hide_instructions() : m.skills_show_instructions()}
          </button>
          {open && (
            <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap border-border border-t pt-3 font-mono text-muted text-xs leading-relaxed">
              {detail.instructions}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

/**
 * Catalog personas as cards with an on/off toggle (saved immediately) and their instructions on demand,
 * followed by any enabled persona that has since left the marketplace. The default persona is always on,
 * so the catalog doesn't list it.
 */
export function PersonaCards() {
  const catalog = useCatalog()
  const mine = useMyAbilities()
  const toggle = useToggleAbility()

  if (catalog.isLoading || mine.isLoading) return <Loader />
  const personas = (catalog.data ?? []).filter(ability => ability.type === "persona")
  const enabled = new Set((mine.data?.abilities ?? []).filter(p => p.type === "persona").map(p => p.name))
  const pendingName = toggle.isPending ? toggle.variables?.name : undefined

  return (
    <>
      <ErrorNotice error={catalog.error ?? mine.error} />
      <p className="mt-0 mb-4 text-muted text-sm">{m.personas_intro()}</p>
      {personas.length === 0 ? (
        <Section>
          <p className="m-0 text-muted text-sm">{m.personas_empty()}</p>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {personas.map(persona => (
            <PersonaCard
              key={persona.name}
              persona={persona}
              enabled={enabled.has(persona.name)}
              pending={pendingName === persona.name}
              onToggle={on => toggle.mutate({ type: "persona", name: persona.name, on })}
            />
          ))}
        </div>
      )}
      <UnavailableAbilities types={["persona"]} />
    </>
  )
}
