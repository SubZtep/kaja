import type { CatalogAbility, SkillDetail } from "@kaja/schema/api"
import { skillDetailSchema } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { ScrollText } from "lucide-react"
import { useState } from "react"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { InstructionsDialog } from "./InstructionsDialog"
import { abilitySourceUrl } from "./source"

/** The instructions the model reads, fetched only when its dialog opens. */
function SkillInstructions({ name }: Readonly<{ name: string }>) {
  const apiFetch = useApiFetch()
  const { data, error, isLoading } = useQuery({
    queryKey: ["abilities", "skill", name],
    queryFn: () =>
      apiFetch<SkillDetail>(`/abilities/skill/${encodeURIComponent(name)}`).then(r => skillDetailSchema.parse(r))
  })
  if (isLoading) return <Loader />
  if (error || !data) return <ErrorNotice error={error} />
  return (
    <div className="border-border border-t border-dashed pt-3">
      <div className="whitespace-pre-wrap font-mono text-muted text-xs leading-relaxed">{data.instructions}</div>
      {data.files.length > 0 && (
        <p className="mt-2 font-mono text-muted text-xs">{m.skills_other_files({ files: data.files.join(", ") })}</p>
      )}
    </div>
  )
}

export function SkillCard({
  skill,
  enabled,
  pending,
  onToggle
}: Readonly<{ skill: CatalogAbility; enabled: boolean; pending: boolean; onToggle: (on: boolean) => void }>) {
  const [open, setOpen] = useState(false)
  return (
    <Section className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 font-mono font-semibold text-fg text-sm">{skill.name}</div>
          <p className="m-0 line-clamp-3 text-[13.5px] text-muted" title={skill.description}>
            {skill.description}
          </p>
        </div>
        <Checkbox
          className="shrink-0"
          checked={enabled}
          disabled={pending}
          aria-label={m.skills_toggle({ name: skill.name })}
          onCheckedChange={onToggle}
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex cursor-pointer items-center gap-1 text-muted text-xs hover:text-fg"
      >
        <ScrollText size={13} />
        {m.skills_show_instructions()}
      </button>
      <InstructionsDialog
        title={skill.name}
        description={skill.description}
        sourceUrl={abilitySourceUrl("skill", skill.name)}
        open={open}
        onOpenChange={setOpen}
      >
        {open && <SkillInstructions name={skill.name} />}
      </InstructionsDialog>
    </Section>
  )
}
