import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

export function MemoryAndDatasets() {
  return (
    <LandingSection alt>
      <LandingSectionTitle
        title="Memory & datasets"
        description="Two ways Kaja carries context across a conversation — and across sessions."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section>
          <div className="mb-2 font-semibold text-fg text-[15px]">Persistent memory</div>
          <p className="m-0 text-[13.5px] text-muted">
            Kaja remembers durable facts about you or your project across sessions, and quietly recalls them later. The
            important ones are marked sticky, so they ride along in every conversation without you having to repeat
            yourself.
          </p>
        </Section>
        <Section>
          <div className="mb-2 font-semibold text-fg text-[15px]">Dataset collection</div>
          <p className="m-0 text-[13.5px] text-muted">
            Some personas gently gather a set of facts over the course of a conversation &mdash; the onboarding
            assistant, for example, gets to know a new user one question at a time.
          </p>
        </Section>
      </div>
    </LandingSection>
  )
}
