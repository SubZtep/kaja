import { Dialog } from "@base-ui/react/dialog"
import type { CatalogPackage, UpdateWidgetKeyRequest, WidgetKey } from "@kaja/schema/api"
import { widgetTypeSchema } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { SkillChecklist } from "../../../components/packages/SkillChecklist"
import { useAppForm } from "../../../lib/form"
import { m } from "../../../paraglide/messages.js"

const AUTO_SELECT_PERSONA = ""
const WIDGET_TYPE_OPTIONS = widgetTypeSchema.options.map(value => ({ value, label: value }))

const editFormSchema = z.object({
  label: z.string().min(1, m.mcp_servers_validation_required()),
  allowedOrigins: z.string().min(1, m.mcp_servers_validation_required()),
  widgetType: widgetTypeSchema,
  persona: z.string()
})

/** Comma or newline separated origins, e.g. "https://example.com, https://www.example.com". */
export function parseOrigins(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map(o => o.trim())
    .filter(Boolean)
}

/** Edits a widget key's label, origins, type, persona and skills. The key itself never changes, so the embed snippet keeps working. */
export function EditWidgetDialog({
  widgetKey,
  personas,
  skills,
  onSave,
  isPending,
  children
}: Readonly<{
  widgetKey: WidgetKey
  personas: { id: string; label: string }[]
  skills: CatalogPackage[]
  onSave: (payload: UpdateWidgetKeyRequest) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)
  const [selectedSkills, setSelectedSkills] = useState(widgetKey.config.skills ?? [])

  const form = useAppForm({
    defaultValues: {
      label: widgetKey.label,
      allowedOrigins: widgetKey.allowedOrigins.join(", "),
      widgetType: widgetKey.config.widgetType,
      persona: widgetKey.config.persona ?? AUTO_SELECT_PERSONA
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        label: value.label.trim(),
        allowedOrigins: parseOrigins(value.allowedOrigins),
        config: {
          widgetType: value.widgetType,
          persona: value.persona || undefined,
          skills: selectedSkills
        }
      })
      // Closed here rather than by a Dialog.Close on the submit button, so a failed request keeps the edits.
      setOpen(false)
    }
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black opacity-70 transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 max-h-[calc(100dvh-4rem)] w-[36rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          <Dialog.Title className="-mt-1.5 mb-1 font-bold text-fg text-lg">{m.widget_edit_title()}</Dialog.Title>
          <Dialog.Description className="mb-6 font-mono text-muted text-sm">{widgetKey.keyPrefix}…</Dialog.Description>

          <form
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="label">
              {field => <field.TextField label={m.widget_field_label()} layout="stack" />}
            </form.AppField>
            <form.AppField name="allowedOrigins">
              {field => <field.TextField label={m.widget_field_allowed_origins()} layout="stack" />}
            </form.AppField>
            <form.AppField name="widgetType">
              {field => <field.SelectField label={m.widget_field_type()} options={WIDGET_TYPE_OPTIONS} />}
            </form.AppField>
            <form.AppField name="persona">
              {field => (
                <field.SelectField
                  label={m.widget_field_persona()}
                  options={[
                    { value: AUTO_SELECT_PERSONA, label: m.widget_field_persona_auto() },
                    ...personas.map(p => ({ value: p.id, label: p.label }))
                  ]}
                />
              )}
            </form.AppField>
            <SkillChecklist skills={skills} selected={selectedSkills} onChange={setSelectedSkills} />

            <div className="flex justify-end gap-4">
              <Dialog.Close render={<Button type="button" />}>{m.confirm_dialog_cancel()}</Dialog.Close>
              <Button type="submit" variant="primary" loading={isPending}>
                {m.widget_edit_save()}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
