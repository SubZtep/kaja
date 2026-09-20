import type { AbilityType } from "@kaja/schema/api"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Section } from "../ui/Section"
import { useMyAbilities, useToggleAbility } from "./queries"

/** The user's enabled abilities of these `types` that left the marketplace (or can't run here any more), each with a way to turn it off. */
export function UnavailableAbilities({ types }: Readonly<{ types: AbilityType[] }>) {
  const mine = useMyAbilities()
  const toggle = useToggleAbility()
  const unavailable = (mine.data?.abilities ?? []).filter(p => types.includes(p.type) && !p.available)
  if (unavailable.length === 0) return null
  const pendingName = toggle.isPending ? toggle.variables?.name : undefined

  return (
    <Section className="mt-6" title={m.skills_unavailable_title()}>
      <p className="mt-0 mb-4 text-muted text-sm">{m.skills_unavailable_description()}</p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {unavailable.map(ability => (
          <li key={`${ability.type}:${ability.name}`} className="flex items-center justify-between gap-3">
            <span className="font-mono text-fg text-sm">{ability.name}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={pendingName === ability.name}
              onClick={() => toggle.mutate({ type: ability.type, name: ability.name, on: false })}
            >
              {m.skills_turn_off()}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
