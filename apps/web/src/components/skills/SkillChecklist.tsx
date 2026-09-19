import { Field } from "@base-ui/react/field"
import type { CatalogPackage } from "@kaja/schema/api"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"

/** A widget key's own skill list: one checkbox per catalog skill, controlled by the caller. */
export function SkillChecklist({
  skills,
  selected,
  onChange
}: Readonly<{ skills: CatalogPackage[]; selected: string[]; onChange: (next: string[]) => void }>) {
  const toggle = (name: string, on: boolean) =>
    onChange(on ? [...selected, name] : selected.filter(existing => existing !== name))

  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 font-medium text-[13px] text-muted">{m.widget_field_skills()}</legend>
      {skills.length === 0 ? (
        <p className="m-0 text-muted text-sm">{m.widget_field_skills_empty()}</p>
      ) : (
        <>
          <p className="m-0 mb-1 text-muted text-xs">{m.widget_field_skills_hint()}</p>
          {skills.map(skill => (
            <Field.Root key={skill.name}>
              <Field.Label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox checked={selected.includes(skill.name)} onCheckedChange={on => toggle(skill.name, on)} />
                <span className="font-mono text-fg text-sm">{skill.name}</span>
              </Field.Label>
            </Field.Root>
          ))}
        </>
      )}
    </fieldset>
  )
}
