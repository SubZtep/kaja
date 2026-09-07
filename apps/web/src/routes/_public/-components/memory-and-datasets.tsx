import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"
import { m } from "../../../paraglide/messages.js"

export function MemoryAndDatasets() {
  return (
    <LandingSection alt>
      <LandingSectionTitle title={m.memory_title()} description={m.memory_description()} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section className="border-0 p-0 sm:border sm:px-6 sm:py-6">
          <div className="mb-2 font-semibold text-fg text-[15px]">{m.memory_persistent_title()}</div>
          <p className="m-0 text-[13.5px] text-muted">{m.memory_persistent_desc()}</p>
        </Section>
        <Section className="border-0 p-0 sm:border sm:px-6 sm:py-6">
          <div className="mb-2 font-semibold text-fg text-[15px]">{m.memory_dataset_title()}</div>
          <p className="m-0 text-[13.5px] text-muted">{m.memory_dataset_desc()}</p>
        </Section>
      </div>
    </LandingSection>
  )
}
