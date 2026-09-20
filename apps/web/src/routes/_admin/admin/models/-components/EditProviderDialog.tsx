import { Dialog } from "@base-ui/react/dialog"
import type { Provider, UpdateProviderRequest } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../../../components/form/primitives/Button"
import { useAppForm } from "../../../../../lib/form"
import { m } from "../../../../../paraglide/messages.js"

const editFormSchema = z.object({
  name: z.string().min(1, m.models_validation_required()),
  baseUrl: z.url(m.models_validation_invalid_url()),
  apiKey: z.string()
})

/**
 * Edits an existing provider's name, base URL, and API key. The key field is left blank by
 * default and only sent when filled in — an absent key means "leave unchanged" to the API, and
 * leaving it blank on submit avoids ever having to round-trip the secret back into the form.
 */
export function EditProviderDialog({
  provider,
  onSave,
  isPending,
  children
}: Readonly<{
  provider: Provider
  onSave: (payload: UpdateProviderRequest) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)

  const form = useAppForm({
    defaultValues: {
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: ""
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        name: value.name.trim(),
        baseUrl: value.baseUrl.trim(),
        apiKey: value.apiKey.trim() || undefined
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
            {m.models_edit_provider_title()}
          </Dialog.Title>
          <Dialog.Description className="mb-6 font-mono text-muted text-sm">{provider.name}</Dialog.Description>

          <form
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="name">
              {field => <field.TextField label={m.models_field_provider_name()} layout="stack" />}
            </form.AppField>
            <form.AppField name="baseUrl">
              {field => <field.TextField label={m.models_field_base_url()} layout="stack" />}
            </form.AppField>
            <form.AppField name="apiKey">
              {field => (
                <field.TextField
                  label={m.models_field_api_key()}
                  layout="stack"
                  placeholder={m.models_field_api_key_edit_placeholder()}
                />
              )}
            </form.AppField>

            <div className="flex justify-end gap-4">
              <Dialog.Close render={<Button type="button" />}>{m.confirm_dialog_cancel()}</Dialog.Close>
              <Button type="submit" variant="primary" loading={isPending}>
                {m.models_edit_provider_save()}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
