import { Server } from "lucide-react"
import { Section } from "../../../../components/ui/Section"

export function NoNodesBanner() {
  return (
    <Section className="py-8 sm:py-12 text-center">
      <div className="mb-4 flex justify-center">
        <div className="flex size-12 items-center justify-center rounded-md border border-border bg-surface-2">
          <Server size={24} className="text-muted" />
        </div>
      </div>
      <h2 className="m-0 mb-2 font-semibold text-fg text-[15px]">No nodes connected</h2>
      <p className="mx-auto m-0 max-w-md text-[13.5px] text-muted">
        Connect a CLI node to start seeing your orchestrated nodes here.
      </p>
    </Section>
  )
}
