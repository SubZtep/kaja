import { ChevronRight } from "lucide-react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"
import { m } from "../../../paraglide/messages.js"

// Read via a function (not a module-scope constant) so labels re-evaluate per render —
// `m.*()` calls captured at module load can go stale across the SSR/hydration boundary.
const getPersonas = () => [
  { id: "default", label: m.personas_default_label(), when: m.personas_default_when() },
  { id: "barkochba", label: m.personas_barkochba_label(), when: m.personas_barkochba_when() },
  {
    id: "care",
    label: m.personas_care_label(),
    when: m.personas_care_when()
  },
  {
    id: "onboarding",
    label: m.personas_onboarding_label(),
    when: m.personas_onboarding_when()
  }
]

export function Personas() {
  return (
    <LandingSection>
      <LandingSectionTitle
        title={m.personas_title()}
        meta={
          <div className="flex items-center gap-1">
            <ChevronRight />
            <a
              href="https://github.com/SubZtep/kaja/blob/stability/docs/config/schemas/persona.json"
              target="_blank"
              rel="noopener"
            >
              {m.personas_schema_link()}
            </a>
          </div>
        }
        description={m.personas_description()}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {getPersonas().map(p => (
          <Section key={p.id} className="border-0 bg-transparent p-0 sm:border sm:px-6 sm:py-6">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="font-semibold text-fg text-[15px]">{p.label}</div>
              <span className="font-mono text-[#6e7681] text-[11px]">{p.id}.toml</span>
            </div>
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] text-muted leading-relaxed">
              when = <span className="text-neon-hi">"{p.when}"</span>
            </div>
          </Section>
        ))}
      </div>
    </LandingSection>
  )
}
