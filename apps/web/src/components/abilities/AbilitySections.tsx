import { m } from "../../paraglide/messages.js"
import { AbilityCards } from "./AbilityCards"
import { PersonaCards } from "./PersonaCards"

/** Skills, tools and MCP servers as one list, for /abilities and the /welcome step; `personas` adds the Personas section after it. */
export function AbilitySections({ personas = false }: Readonly<{ personas?: boolean }>) {
  return (
    <div className="space-y-10">
      <AbilityCards />
      {personas && (
        <section id="personas" className="scroll-mt-24">
          <h2 className="mb-4 font-semibold text-fg text-lg">{m.abilities_section_personas()}</h2>
          <PersonaCards />
        </section>
      )}
    </div>
  )
}
