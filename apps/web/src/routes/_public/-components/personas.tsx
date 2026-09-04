import { ChevronRight } from "lucide-react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

const PERSONAS = [
  { id: "default", label: "Helpful assistant", when: "no other persona clearly fits the conversation" },
  { id: "barkochba", label: "Barkochba guesser", when: "the user wants to play a guessing game / twenty questions" },
  {
    id: "care",
    label: "Self-care companion",
    when: "the user talks about their day, feelings, mood, or personal struggles"
  },
  {
    id: "onboarding",
    label: "Onboarding assistant",
    when: "a new user should be walked through the initial getting-to-know-you questions"
  }
]

export function Personas() {
  return (
    <LandingSection>
      <LandingSectionTitle
        title="Personas"
        meta={
          <div className="flex items-center gap-1">
            <ChevronRight />
            <a
              href="https://github.com/SubZtep/kaja/blob/stability/docs/config/schemas/persona.json"
              target="_blank"
              rel="noopener"
            >
              TOML’s JSON Schema
            </a>
          </div>
        }
        description={
          <>
            Each persona is a <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">.toml</code> file:
            a label, its system-prompt instructions, and an optional{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">when</code> clause. Kaja reads the
            room and switches personas mid-conversation on its own &mdash; no command needed.
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PERSONAS.map(p => (
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
