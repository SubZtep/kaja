import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

export function MemoryAndDatasets() {
  return (
    <LandingSection alt>
      <LandingSectionTitle title="Memory & Datasets" description="How Kaja remembers you, across chats and sessions." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section className="border-0 p-0 sm:border sm:px-6 sm:py-6">
          <div className="mb-2 font-semibold text-fg text-[15px]">Persistent memory</div>
          <p className="m-0 text-[13.5px] text-muted">
            Kaja remembers key facts about you and recalls them later, so you never repeat yourself. &mdash; Mark the
            important ones sticky to keep them in every conversation.
          </p>
        </Section>
        <Section className="border-0 p-0 sm:border sm:px-6 sm:py-6">
          <div className="mb-2 font-semibold text-fg text-[15px]">Dataset collection</div>
          <p className="m-0 text-[13.5px] text-muted">
            Some personas monitor a conversation for a set of fields and gently repeat their questions &mdash; even day
            after day &mdash; until every one is filled in.
          </p>
        </Section>
      </div>
    </LandingSection>
  )
}
