import type { PackageType } from "@kaja/schema/api"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Section } from "../ui/Section"
import { useMyPackages, useTogglePackage } from "./queries"

/** The user's enabled packages of these `types` that left the marketplace (or can't run here any more), each with a way to turn it off. */
export function UnavailablePackages({ types }: Readonly<{ types: PackageType[] }>) {
  const mine = useMyPackages()
  const toggle = useTogglePackage()
  const unavailable = (mine.data?.packages ?? []).filter(p => types.includes(p.type) && !p.available)
  if (unavailable.length === 0) return null
  const pendingName = toggle.isPending ? toggle.variables?.name : undefined

  return (
    <Section className="mt-6" title={m.skills_unavailable_title()}>
      <p className="mt-0 mb-4 text-muted text-sm">{m.skills_unavailable_description()}</p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {unavailable.map(pkg => (
          <li key={`${pkg.type}:${pkg.name}`} className="flex items-center justify-between gap-3">
            <span className="font-mono text-fg text-sm">{pkg.name}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={pendingName === pkg.name}
              onClick={() => toggle.mutate({ type: pkg.type, name: pkg.name, on: false })}
            >
              {m.skills_turn_off()}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
