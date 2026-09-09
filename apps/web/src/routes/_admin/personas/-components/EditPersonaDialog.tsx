import { Dialog } from "@base-ui/react/dialog"
import type { Persona, UpdatePersonaRequest } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../../components/form/primitives/Button"
import { useAppForm } from "../../../../lib/form"
import { m } from "../../../../paraglide/messages.js"

const editFormSchema = z.object({
  label: z.string().min(1, m.personas_admin_validation_required()),
  when: z.string(),
  instructions: z.string(),
  dataset: z.string(),
  sortOrder: z.string()
})

/** Empty input clears the column, so send an explicit null rather than dropping the key — an absent key means "leave unchanged" to the API. */
function nullableText(value: string): string | null {
  return value.trim() || null
}

/**
 * Edits an existing persona's text fields and ordering. Enabled is toggled straight from the table,
 * and personaId is immutable here — renaming one would orphan any widget config pinned to it.
 */
export function EditPersonaDialog({
  persona,
  onSave,
  isPending,
  children
}: Readonly<{
  persona: Persona
  onSave: (payload: UpdatePersonaRequest) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)

  const form = useAppForm({
    defaultValues: {
      label: persona.label,
      when: persona.when ?? "",
      instructions: persona.instructions ?? "",
      dataset: persona.dataset ?? "",
      sortOrder: String(persona.sortOrder)
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        label: value.label.trim(),
        when: nullableText(value.when),
        instructions: nullableText(value.instructions),
        dataset: nullableText(value.dataset),
        sortOrder: Number.parseInt(value.sortOrder, 10) || 0
      })
      // Closed here rather than by a Dialog.Close on the submit button, so a validation error or a
      // failed request leaves the dialog open with the user's edits intact.
      setOpen(false)
    }
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black opacity-70 transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 max-h-[calc(100dvh-4rem)] w-[36rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          <Dialog.Title className="-mt-1.5 mb-1 font-bold text-fg text-lg">
            {m.personas_admin_edit_title()}
          </Dialog.Title>
          <Dialog.Description className="mb-6 font-mono text-muted text-sm">{persona.personaId}</Dialog.Description>

          <form
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="label">
              {field => <field.TextField label={m.personas_admin_field_label()} layout="stack" />}
            </form.AppField>
            <form.AppField name="when">
              {field => <field.TextField label={m.personas_admin_field_when()} layout="stack" />}
            </form.AppField>
            <form.AppField name="dataset">
              {field => <field.TextField label={m.personas_admin_field_dataset()} layout="stack" />}
            </form.AppField>
            <form.AppField name="sortOrder">
              {field => <field.TextField label={m.personas_admin_field_sort_order()} layout="stack" type="number" />}
            </form.AppField>
            <form.AppField name="instructions">
              {field => <field.TextAreaField label={m.personas_admin_field_instructions()} layout="stack" rows={8} />}
            </form.AppField>

            <div className="flex justify-end gap-4">
              <Dialog.Close render={<Button type="button" />}>{m.confirm_dialog_cancel()}</Dialog.Close>
              <Button type="submit" variant="primary" loading={isPending}>
                {m.personas_admin_edit_save()}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
