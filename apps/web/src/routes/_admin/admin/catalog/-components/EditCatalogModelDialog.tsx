import { Dialog } from "@base-ui/react/dialog"
import type { CatalogModel, ModelTask, UpdateCatalogModelRequest } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../../../components/form/primitives/Button"
import { DIALOG_TITLE, DialogShell } from "../../../../../components/ui/DialogShell"
import { useAppForm } from "../../../../../lib/form"
import { m } from "../../../../../paraglide/messages.js"
import { TaskCheckboxes } from "../../models/-components/TaskCheckboxes"

const editFormSchema = z
  .object({
    tasks: z.array(z.string()),
    defaultTasks: z.array(z.string()),
    images: z.boolean(),
    contextWindow: z.string().regex(/^\d*$/, m.models_validation_context_window())
  })
  .refine(value => value.defaultTasks.every(task => value.tasks.includes(task)), {
    path: ["defaultTasks"],
    message: m.catalog_validation_default_tasks()
  })

/**
 * Edits a catalog model's tasks (which then stop following models.dev), the tasks it is its provider's default for, and
 * its limits.
 */
export function EditCatalogModelDialog({
  model,
  onSave,
  isPending,
  children
}: Readonly<{
  model: CatalogModel
  onSave: (payload: UpdateCatalogModelRequest) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)

  const form = useAppForm({
    defaultValues: {
      tasks: model.tasks as string[],
      defaultTasks: model.defaultTasks as string[],
      images: model.images,
      contextWindow: model.contextWindow ? String(model.contextWindow) : ""
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      const tasksChanged = value.tasks.join() !== model.tasks.join()
      await onSave({
        // Sent only when changed, so an untouched model keeps following models.dev.
        tasks: tasksChanged ? (value.tasks as ModelTask[]) : undefined,
        defaultTasks: value.defaultTasks as ModelTask[],
        images: value.images,
        contextWindow: Number(value.contextWindow) || null
      })
      setOpen(false)
    }
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <DialogShell className="w-xl">
          <Dialog.Title className={DIALOG_TITLE}>{m.catalog_edit_model_title()}</Dialog.Title>
          <Dialog.Description className="text-muted mb-6 font-mono text-sm">{model.model}</Dialog.Description>

          <form
            noValidate
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="tasks">
              {field => (
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted text-[13px] font-medium">{m.catalog_field_tasks()}</span>
                  <TaskCheckboxes value={field.state.value} onChange={value => field.handleChange(value)} />
                </div>
              )}
            </form.AppField>
            <form.AppField name="defaultTasks">
              {field => (
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted text-[13px] font-medium">{m.catalog_field_default_tasks()}</span>
                  <TaskCheckboxes value={field.state.value} onChange={value => field.handleChange(value)} />
                  {field.state.meta.errors.length > 0 && (
                    <span className="text-[13px] text-red-400">{m.catalog_validation_default_tasks()}</span>
                  )}
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
            <form.AppField name="images">
              {field => <field.CheckboxField label={m.catalog_field_images()} />}
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
