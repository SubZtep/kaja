import { Dialog } from "@base-ui/react/dialog"
import type { Model, ModelTask, Provider, UpdateModelRequest } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../../../components/form/primitives/Button"
import { useAppForm } from "../../../../../lib/form"
import { m } from "../../../../../paraglide/messages.js"
import { TaskCheckboxes } from "./TaskCheckboxes"

const editFormSchema = z.object({
  providerId: z.string().min(1, m.models_validation_required()),
  model: z.string().min(1, m.models_validation_required()),
  tasks: z.array(z.string()).min(1, m.models_validation_select_task()),
  // Blank means detect it from the provider.
  contextWindow: z.string().regex(/^\d*$/, m.models_validation_context_window())
})

/** Edits an existing model's provider, name, tasks and context window; clearing the window goes back to asking the provider. */
export function EditModelDialog({
  model,
  providers,
  onSave,
  isPending,
  children
}: Readonly<{
  model: Model
  providers: Provider[]
  onSave: (payload: UpdateModelRequest) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)

  const form = useAppForm({
    defaultValues: {
      providerId: model.providerId,
      model: model.model,
      tasks: model.tasks as string[],
      contextWindow: model.contextWindow ? String(model.contextWindow) : ""
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        providerId: value.providerId,
        model: value.model.trim(),
        tasks: value.tasks as ModelTask[],
        contextWindow: Number(value.contextWindow) || null
      })
      // Closed here rather than by a Dialog.Close on the submit button, so a validation error or a
      // failed request leaves the dialog open with the user's edits intact.
      setOpen(false)
    }
  })

  return (
    <Dialog.Root
      open={open}
      onOpenChange={next => {
        // Opens on the model as it is now, not on edits abandoned last time.
        if (next) form.reset()
        setOpen(next)
      }}
    >
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black opacity-70 transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 max-h-[calc(100dvh-4rem)] w-[36rem] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          <Dialog.Title className="-mt-1.5 mb-1 font-bold text-fg text-lg">{m.models_edit_model_title()}</Dialog.Title>
          <Dialog.Description className="mb-6 break-all font-mono text-muted text-sm">{model.model}</Dialog.Description>

          <form
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="providerId">
              {field => (
                <field.SelectField
                  label={m.models_field_provider()}
                  layout="stack"
                  options={providers.map(p => ({ value: p.id, label: p.name }))}
                />
              )}
            </form.AppField>
            <form.AppField name="model">
              {field => <field.TextField label={m.models_field_model()} layout="stack" />}
            </form.AppField>
            <form.AppField name="tasks">
              {field => (
                <div className="grid gap-2">
                  <span className="text-sm">{m.models_field_tasks()}</span>
                  <TaskCheckboxes value={field.state.value} onChange={value => field.handleChange(value)} />
                </div>
              )}
            </form.AppField>
            <form.AppField name="contextWindow">
              {field => (
                <field.TextField
                  label={m.models_field_context_window()}
                  layout="stack"
                  placeholder={m.models_field_context_window_placeholder()}
                  inputMode="numeric"
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
