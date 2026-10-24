import type { CatalogProvider, UpdateCatalogProviderRequest } from "@kaja/schema/api"
import { z } from "zod"
import { Button } from "../../../../../components/form/primitives/Button"
import { useAppForm } from "../../../../../lib/form"
import { m } from "../../../../../paraglide/messages.js"

export const kindOptions = () => [
  { value: "hosted", label: m.catalog_kind_hosted() },
  { value: "self-hosted", label: m.catalog_kind_self_hosted() }
]

const settingsSchema = z.object({
  listed: z.boolean(),
  name: z.string().min(1, m.models_validation_required()),
  kind: z.enum(["hosted", "self-hosted"]),
  // Blank goes back to models.dev's address.
  baseUrl: z.union([z.literal(""), z.url(m.models_validation_invalid_url())]),
  note: z.string(),
  position: z.string().regex(/^-?\d+$/, m.catalog_validation_position())
})

/** A catalog provider's own fields: listed, name, kind, address override, note and order. */
export function ProviderSettings({
  provider,
  onSave,
  isPending
}: Readonly<{
  provider: CatalogProvider
  onSave: (payload: UpdateCatalogProviderRequest) => Promise<unknown>
  isPending: boolean
}>) {
  const form = useAppForm({
    defaultValues: {
      listed: provider.listed,
      name: provider.name,
      kind: provider.kind as string,
      baseUrl: provider.baseUrl ?? "",
      note: provider.note ?? "",
      position: String(provider.position)
    },
    validators: { onSubmit: settingsSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        listed: value.listed,
        name: value.name.trim(),
        kind: value.kind as CatalogProvider["kind"],
        baseUrl: value.baseUrl.trim() || null,
        note: value.note.trim() || null,
        position: Number(value.position)
      })
    }
  })

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <form.AppField name="listed">
        {field => <field.CheckboxField label={m.catalog_field_listed()} className="sm:col-span-2" />}
      </form.AppField>
      <form.AppField name="name">{field => <field.TextField label={m.catalog_field_name()} />}</form.AppField>
      <form.AppField name="kind">
        {field => <field.SelectField label={m.catalog_field_kind()} options={kindOptions()} />}
      </form.AppField>
      <form.AppField name="baseUrl">
        {field => <field.TextField label={m.catalog_field_base_url_override()} placeholder={provider.apiUrl ?? ""} />}
      </form.AppField>
      <form.AppField name="position">
        {field => <field.TextField label={m.catalog_field_position()} inputMode="numeric" />}
      </form.AppField>
      <form.AppField name="note">
        {field => (
          <div className="sm:col-span-2">
            <field.TextField label={m.catalog_field_note()} />
          </div>
        )}
      </form.AppField>
      <Button type="submit" variant="primary" className="justify-self-start sm:col-span-2" loading={isPending}>
        {m.catalog_save()}
      </Button>
    </form>
  )
}
