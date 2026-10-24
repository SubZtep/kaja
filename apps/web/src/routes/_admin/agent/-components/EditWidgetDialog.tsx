import { Dialog } from "@base-ui/react/dialog"
import type { UpdateWidgetRequest, Widget } from "@kaja/schema/api"
import { useState } from "react"
import { z } from "zod"
import { Button } from "../../../../components/form/primitives/Button"
import { DIALOG_TITLE, DialogShell } from "../../../../components/ui/DialogShell"
import { useAppForm } from "../../../../lib/form"
import { m } from "../../../../paraglide/messages.js"

const editFormSchema = z.object({
  label: z.string().min(1, m.validation_required()),
  intent: z.string().min(1, m.validation_required()),
  model: z.string().min(1, m.validation_required()),
  kind: z.enum(["browser", "server"]),
  selector: z.string()
})

function targetLabel(widget: Widget): string {
  return widget.target.kind === "browser" ? widget.target.selector : m.widget_target_server()
}

function SourceBlock({ title, source, error }: Readonly<{ title: string; source?: string; error?: string | null }>) {
  if (!source && !error) return null
  return (
    <div>
      <p className="text-fg mb-1 text-sm">{title}</p>
      {error ? <p className="font-mono text-xs text-red-400">{error}</p> : null}
      {source ? (
        <pre className="text-muted max-h-48 overflow-auto rounded-md bg-black/40 p-3 font-mono text-xs">{source}</pre>
      ) : null}
    </div>
  )
}

/** Edits a widget and reviews the draft before it is published. */
export function EditWidgetDialog({
  widget,
  widgets,
  onSave,
  onPublish,
  onDiscard,
  onGenerate,
  onLink,
  onUnlink,
  isPending,
  children
}: Readonly<{
  widget: Widget
  widgets: Widget[]
  onSave: (payload: UpdateWidgetRequest) => Promise<unknown>
  onPublish: () => Promise<unknown>
  onDiscard: () => Promise<unknown>
  onGenerate: () => Promise<unknown>
  onLink: (to: string) => Promise<unknown>
  onUnlink: (to: string) => Promise<unknown>
  isPending: boolean
  children: React.ReactElement
}>) {
  const [open, setOpen] = useState(false)
  const [linkTo, setLinkTo] = useState("")
  const others = widgets.filter(item => item.id !== widget.id && item.enabled && !widget.links.includes(item.id))

  const form = useAppForm({
    defaultValues: {
      label: widget.label,
      intent: widget.intent,
      model: widget.model,
      kind: widget.target.kind,
      selector: widget.target.kind === "browser" ? widget.target.selector : "#kaja-barkochba"
    },
    validators: { onSubmit: editFormSchema },
    onSubmit: async ({ value }) => {
      await onSave({
        label: value.label.trim(),
        intent: value.intent.trim(),
        model: value.model.trim(),
        target:
          value.kind === "browser"
            ? { kind: "browser", page: "home", selector: value.selector.trim() }
            : { kind: "server" }
      })
      setOpen(false)
    }
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <DialogShell className="w-xl">
          <Dialog.Title className={DIALOG_TITLE}>{m.widget_edit_title()}</Dialog.Title>
          <Dialog.Description className="text-muted mb-6 font-mono text-sm">
            {widget.tokenPrefix}… · {targetLabel(widget)}
          </Dialog.Description>
          <form
            noValidate
            onSubmit={e => {
              e.preventDefault()
              form.handleSubmit()
            }}
            className="grid gap-4"
          >
            <form.AppField name="label">
              {field => <field.TextField label={m.widget_field_label()} layout="stack" />}
            </form.AppField>
            <form.AppField name="intent">
              {field => <field.TextAreaField label={m.widget_field_intent()} layout="stack" rows={4} />}
            </form.AppField>
            <form.AppField name="model">
              {field => <field.TextField label={m.widget_field_model()} layout="stack" />}
            </form.AppField>
            <form.AppField name="kind">
              {field => (
                <field.SelectField
                  label={m.widget_field_target()}
                  options={[
                    { value: "browser", label: m.widget_target_browser() },
                    { value: "server", label: m.widget_target_server() }
                  ]}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={state => state.values.kind}>
              {kind =>
                kind === "browser" && (
                  <form.AppField name="selector">
                    {field => <field.TextField label={m.widget_field_selector()} layout="stack" />}
                  </form.AppField>
                )
              }
            </form.Subscribe>
            <div className="flex justify-end gap-4">
              <Dialog.Close render={<Button type="button" />}>{m.confirm_dialog_cancel()}</Dialog.Close>
              <Button type="submit" variant="primary" loading={isPending}>
                {m.widget_edit_save()}
              </Button>
            </div>
          </form>
          <div className="mt-6 grid gap-4">
            <SourceBlock title={m.widget_source_draft()} source={widget.draft?.source} error={widget.draft?.error} />
            <SourceBlock title={m.widget_source_published()} source={widget.published?.source} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" loading={isPending} onClick={() => onGenerate()}>
                {m.widget_generate()}
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={isPending}
                disabled={!widget.draft || Boolean(widget.draft.error)}
                onClick={() => onPublish()}
              >
                {m.widget_publish()}
              </Button>
              <Button type="button" loading={isPending} disabled={!widget.draft} onClick={() => onDiscard()}>
                {m.widget_discard()}
              </Button>
            </div>
            {widget.links.length > 0 && (
              <ul className="text-muted font-mono text-xs">
                {widget.links.map(id => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span>{widgets.find(item => item.id === id)?.label ?? id}</span>
                    <Button type="button" onClick={() => onUnlink(id)}>
                      {m.widget_unlink()}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {others.length > 0 && (
              <div className="flex gap-2">
                <select
                  className="border-border bg-surface flex-1 rounded-md border px-2"
                  value={linkTo}
                  onChange={event => setLinkTo(event.target.value)}
                >
                  <option value="">{m.widget_link()}</option>
                  {others.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  disabled={!linkTo}
                  onClick={() => linkTo && onLink(linkTo).then(() => setLinkTo(""))}
                >
                  {m.widget_link()}
                </Button>
              </div>
            )}
          </div>
        </DialogShell>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
