import { Dialog } from "@base-ui/react/dialog"
import type { CatalogProvider, UpdateCatalogProviderRequest } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../../../components/form/primitives/Button"
import { DIALOG_TITLE, DialogShell } from "../../../../../components/ui/DialogShell"
import { useAppForm } from "../../../../../lib/form"
import { m } from "../../../../../paraglide/messages.js"

export const kindOptions = () => [
  { value: "hosted", label: m.catalog_kind_hosted() },
  { value: "self-hosted", label: m.catalog_kind_self_hosted() }
]

const editFormSchema = z.object({
  name: z.string().min(1, m.models_validation_required()),
  kind: z.enum(["hosted", "self-hosted"]),
  // Blank goes back to models.dev's address.
  baseUrl: z.union([z.literal(""), z.url(m.models_validation_invalid_url())]),
  note: z.string(),
  position: z.string().regex(/^-?\d+$/, m.catalog_validation_position())
})

/** Edits a catalog provider's name, kind, address override, note and order. */
export function EditCatalogProviderDialog({
  provider,
  onSave,
  isPending,
  children
}: Readonly<{
  provider: CatalogProvider
  onSave: (payload: UpdateCatalogProviderRequest) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)

  const form = useAppForm({
    defaultValues: {
      name: provider.name,
      kind: provider.kind as string,
      baseUrl: provider.baseUrl ?? "",
      note: provider.note ?? "",
      position: String(provider.position)
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        name: value.name.trim(),
        kind: value.kind as CatalogProvider["kind"],
        baseUrl: value.baseUrl.trim() || null,
        note: value.note.trim() || null,
        position: Number(value.position)
      })
      // Closed only on success, so a failed request keeps the edits.
      setOpen(false)
    }
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <DialogShell className="w-xl">
          <Dialog.Title className={DIALOG_TITLE}>{m.catalog_edit_provider_title()}</Dialog.Title>
          <Dialog.Description className="text-muted mb-6 font-mono text-sm">{provider.slug}</Dialog.Description>

          <form
            noValidate
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="name">
              {field => <field.TextField label={m.catalog_field_name()} layout="stack" />}
            </form.AppField>
            <form.AppField name="kind">
              {field => <field.SelectField label={m.catalog_field_kind()} layout="stack" options={kindOptions()} />}
            </form.AppField>
            <form.AppField name="baseUrl">
              {field => (
                <field.TextField
                  label={m.catalog_field_base_url_override()}
                  layout="stack"
                  placeholder={provider.apiUrl ?? ""}
                />
              )}
            </form.AppField>
            <form.AppField name="note">
              {field => <field.TextField label={m.catalog_field_note()} layout="stack" />}
            </form.AppField>
            <form.AppField name="position">
              {field => <field.TextField label={m.catalog_field_position()} layout="stack" inputMode="numeric" />}
            </form.AppField>

            <div className="flex justify-end gap-4">
              <Dialog.Close render={<Button type="button" />}>{m.confirm_dialog_cancel()}</Dialog.Close>
              <Button type="submit" variant="primary" loading={isPending}>
                {m.catalog_save()}
              </Button>
            </div>
          </form>
        </DialogShell>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
