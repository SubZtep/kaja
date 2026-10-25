import type { CreateWidgetResponse, ListWidgetsResponse, UpdateWidgetRequest, Widget } from "@kaja/schema/api"
import { widgetSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/button"
import { ConfirmDialog } from "../../../components/ui/confirm-dialog"
import { ErrorNotice } from "../../../components/ui/error-notice"
import { IconButton } from "../../../components/ui/icon-button"
import { Loader } from "../../../components/ui/loader"
import { PageHeader } from "../../../components/ui/page-header"
import { Section } from "../../../components/ui/section"
import { Table } from "../../../components/ui/table"
import { ValueBox } from "../../../components/ui/value-box"
import { useApiFetch } from "../../../lib/api-fetch"
import { useAppForm } from "../../../lib/form"
import { userRequired } from "../../../lib/loaders"
import { seo } from "../../../lib/seo"
import { cellActions, tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { m } from "../../../paraglide/messages.js"
import { EditWidgetDialog } from "./-components/edit-widget-dialog"

export const Route = createFileRoute("/_portal/agent/widget")({
  component: WidgetPage,
  loader: ({ context }) => userRequired(context.session),
  head: () => ({ meta: seo({ title: m.nav_widget() }) })
})

const createFormSchema = z.object({
  label: z.string().min(1, m.validation_required()),
  intent: z.string().min(1, m.validation_required()),
  model: z.string().min(1, m.validation_required()),
  kind: z.enum(["browser", "server"]),
  selector: z.string().min(1, m.validation_required())
})

const columnHelper = tableColumnHelper<Widget>()

function LabelCell(info: CellContext<typeof tableFeaturesConfig, Widget, string>) {
  return <span className="text-fg font-bold">{info.getValue()}</span>
}

function TokenCell(info: CellContext<typeof tableFeaturesConfig, Widget, string>) {
  return <span className="text-muted font-mono text-xs">{info.getValue()}…</span>
}

function TargetCell(info: CellContext<typeof tableFeaturesConfig, Widget, Widget["target"]>) {
  const target = info.getValue()
  return (
    <span className="text-muted font-mono text-xs">
      {target.kind === "browser" ? target.selector : m.widget_target_server()}
    </span>
  )
}

function ModelCell(info: CellContext<typeof tableFeaturesConfig, Widget, string>) {
  return <span className="text-muted font-mono text-xs">{info.getValue()}</span>
}

function GenerationCell(info: CellContext<typeof tableFeaturesConfig, Widget, unknown>) {
  const widget = info.row.original
  let label: string = m.widget_generation_none()
  if (widget.published && widget.draft) label = `${m.widget_published()} + ${m.widget_draft()}`
  else if (widget.published) label = m.widget_published()
  else if (widget.draft) label = m.widget_draft()
  return <span className="text-muted text-xs">{label}</span>
}

function EnabledCell(info: CellContext<typeof tableFeaturesConfig, Widget, boolean>) {
  return (
    <span className={info.getValue() ? "text-neon" : "text-muted"}>
      {info.getValue() ? m.widget_status_active() : m.widget_status_revoked()}
    </span>
  )
}

function CreatedAtCell(info: CellContext<typeof tableFeaturesConfig, Widget, Date>) {
  return <span className="text-muted font-mono text-xs">{getTimeAgo(info.getValue())}</span>
}

function LastUsedAtCell(info: CellContext<typeof tableFeaturesConfig, Widget, Date | null>) {
  const value = info.getValue()
  return <span className="text-muted font-mono text-xs">{value ? getTimeAgo(value) : m.widget_never_used()}</span>
}

type WidgetActionsMeta = Readonly<{
  widgets: Widget[]
  isSaving: boolean
  onSave: (id: string, payload: UpdateWidgetRequest) => Promise<unknown>
  onPublish: (id: string) => Promise<unknown>
  onDiscard: (id: string) => Promise<unknown>
  onGenerate: (id: string) => Promise<unknown>
  onLink: (id: string, to: string) => Promise<unknown>
  onUnlink: (id: string, to: string) => Promise<unknown>
  onRevoke: (id: string) => void
}>

function ActionsCell(info: CellContext<typeof tableFeaturesConfig, Widget, unknown>) {
  const widget = info.row.original
  const actions = cellActions<WidgetActionsMeta>(info.column.columnDef.meta)
  if (!widget.enabled) return null
  return (
    <div className="flex justify-end gap-1">
      <EditWidgetDialog
        widget={widget}
        widgets={actions.widgets}
        isPending={actions.isSaving}
        onSave={payload => actions.onSave(widget.id, payload)}
        onPublish={() => actions.onPublish(widget.id)}
        onDiscard={() => actions.onDiscard(widget.id)}
        onGenerate={() => actions.onGenerate(widget.id)}
        onLink={to => actions.onLink(widget.id, to)}
        onUnlink={to => actions.onUnlink(widget.id, to)}
      >
        <IconButton aria-label={m.widget_edit_title()}>
          <Pencil size={18} />
        </IconButton>
      </EditWidgetDialog>
      <ConfirmDialog
        title={m.widget_revoke_confirm_title()}
        description={m.widget_revoke_confirm_description({ label: widget.label })}
        confirm={m.widget_revoke_confirm_button()}
        onConfirm={() => actions.onRevoke(widget.id)}
      >
        <IconButton variant="danger" aria-label={m.widget_revoke_confirm_button()}>
          <Trash2 size={18} />
        </IconButton>
      </ConfirmDialog>
    </div>
  )
}

function TokenNotice({ rawToken }: Readonly<{ rawToken: string }>) {
  return (
    <div className="border-border bg-surface mt-4 rounded-lg border p-4">
      <p className="text-fg mb-2 text-sm">{m.widget_embed_notice()}</p>
      <p className="text-neon font-mono text-sm break-all">{rawToken}</p>
    </div>
  )
}

function WidgetPage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const { data, error, isLoading } = useQuery({
    queryKey: ["widgets"],
    queryFn: () =>
      apiFetch<ListWidgetsResponse>("/widget/manage").then(body => z.array(widgetSchema).parse(body.widgets))
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["widgets"] })
  const saved = (message: string) => {
    invalidate()
    toast.success(message)
  }

  const createWidget = useMutation({
    mutationFn: (payload: { label: string; intent: string; model: string; target: Widget["target"] }) =>
      apiFetch<CreateWidgetResponse>("/widget/manage", payload),
    onSuccess: response => {
      invalidate()
      setJustCreated(response.rawToken)
      toast.success(m.widget_success_created())
    },
    onError: (err: Error) => toast.error(err.message || m.widget_error_create_failed())
  })

  const updateWidget = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateWidgetRequest }) =>
      apiFetch(`/widget/manage/${id}`, payload, { method: "PATCH" }).then(body => widgetSchema.parse(body)),
    onSuccess: () => saved(m.widget_success_updated()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_update_failed())
  })

  const publishWidget = useMutation({
    mutationFn: (id: string) => apiFetch(`/widget/manage/${id}/publish`, undefined, { method: "POST" }),
    onSuccess: () => saved(m.widget_success_published()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_publish_failed())
  })

  const discardDraft = useMutation({
    mutationFn: (id: string) => apiFetch(`/widget/manage/${id}/draft`, undefined, { method: "DELETE" }),
    onSuccess: () => saved(m.widget_success_updated()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_update_failed())
  })

  const generateWidget = useMutation({
    mutationFn: (id: string) => apiFetch(`/widget/manage/${id}/generate`, undefined, { method: "POST" }),
    onSuccess: () => saved(m.widget_success_updated()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_update_failed())
  })

  const linkWidget = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => apiFetch(`/widget/manage/${id}/links`, { to }),
    onSuccess: () => saved(m.widget_success_updated()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_update_failed())
  })

  const unlinkWidget = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) =>
      apiFetch(`/widget/manage/${id}/links/${to}`, undefined, { method: "DELETE" }),
    onSuccess: () => saved(m.widget_success_updated()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_update_failed())
  })

  const revokeWidget = useMutation({
    mutationFn: (id: string) => apiFetch(`/widget/manage/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => saved(m.widget_success_revoked()),
    onError: (err: Error) => toast.error(err.message || m.widget_error_revoke_failed())
  })

  const form = useAppForm({
    defaultValues: {
      label: "",
      intent: "",
      model: "",
      kind: "server" as "browser" | "server",
      selector: "#kaja-barkochba"
    },
    validators: { onSubmit: createFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createWidget.mutateAsync({
        label: value.label.trim(),
        intent: value.intent.trim(),
        model: value.model.trim(),
        target:
          value.kind === "browser"
            ? { kind: "browser", page: "home", selector: value.selector.trim() }
            : { kind: "server" }
      })
      formApi.reset()
    }
  })

  const busy =
    updateWidget.isPending ||
    publishWidget.isPending ||
    discardDraft.isPending ||
    generateWidget.isPending ||
    linkWidget.isPending ||
    unlinkWidget.isPending

  const columns = columnHelper.columns([
    columnHelper.accessor("label", { header: m.widget_column_label(), cell: LabelCell }),
    columnHelper.accessor("tokenPrefix", { header: m.widget_column_key(), cell: TokenCell, enableColumnFilter: false }),
    columnHelper.accessor("target", { header: m.widget_column_target(), cell: TargetCell, enableColumnFilter: false }),
    columnHelper.accessor("model", { header: m.widget_column_model(), cell: ModelCell, enableColumnFilter: false }),
    columnHelper.display({ id: "generation", header: m.widget_column_generation(), cell: GenerationCell }),
    columnHelper.accessor("enabled", {
      header: m.widget_column_status(),
      cell: EnabledCell,
      enableColumnFilter: false
    }),
    columnHelper.accessor("createdAt", {
      header: m.widget_column_created(),
      cell: CreatedAtCell,
      enableColumnFilter: false
    }),
    columnHelper.accessor("lastUsedAt", {
      header: m.widget_column_last_used(),
      cell: LastUsedAtCell,
      enableColumnFilter: false
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      meta: {
        actions: {
          widgets: data ?? [],
          isSaving: busy,
          onSave: (id, payload) => updateWidget.mutateAsync({ id, payload }),
          onPublish: id => publishWidget.mutateAsync(id),
          onDiscard: id => discardDraft.mutateAsync(id),
          onGenerate: id => generateWidget.mutateAsync(id),
          onLink: (id, to) => linkWidget.mutateAsync({ id, to }),
          onUnlink: (id, to) => unlinkWidget.mutateAsync({ id, to }),
          onRevoke: id => revokeWidget.mutate(id)
        } satisfies WidgetActionsMeta
      },
      cell: ActionsCell
    })
  ])

  if (isLoading) return <Loader />
  const widgets = data ?? []

  return (
    <>
      <PageHeader title={m.widget_title()} description={m.widget_description()}>
        <ValueBox label={m.widget_total()} variant="neon">
          {widgets.length}
        </ValueBox>
        <ValueBox label={m.widget_active()}>{widgets.filter(widget => widget.enabled).length}</ValueBox>
      </PageHeader>
      <ErrorNotice error={error} />
      <Section className="mb-4" title={m.widget_create_title()}>
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.AppField name="label">
            {field => (
              <field.TextField label={m.widget_field_label()} placeholder={m.widget_field_label_placeholder()} />
            )}
          </form.AppField>
          <form.AppField name="model">
            {field => (
              <field.TextField label={m.widget_field_model()} placeholder={m.widget_field_model_placeholder()} />
            )}
          </form.AppField>
          <form.AppField name="intent">
            {field => (
              <field.TextAreaField
                label={m.widget_field_intent()}
                placeholder={m.widget_field_intent_placeholder()}
                rows={3}
              />
            )}
          </form.AppField>
          <form.AppField name="kind">
            {field => (
              <field.SelectField
                label={m.widget_field_target()}
                options={[
                  { value: "server", label: m.widget_target_server() },
                  { value: "browser", label: m.widget_target_browser() }
                ]}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={state => state.values.kind}>
            {kind =>
              kind === "browser" && (
                <form.AppField name="selector">
                  {field => <field.TextField label={m.widget_field_selector()} />}
                </form.AppField>
              )
            }
          </form.Subscribe>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createWidget.isPending}>
            {m.widget_create_button()}
          </Button>
        </form>
        {justCreated && <TokenNotice rawToken={justCreated} />}
      </Section>
      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={columns} data={widgets} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
