import type {
  CreateWidgetKeyResponse,
  ListWidgetKeysResponse,
  UpdateWidgetKeyRequest,
  WidgetKey
} from "@kaja/schema/api"
import { widgetKeySchema, widgetTypeSchema } from "@kaja/schema/api"
import { type NasiPersonasResponse, NasiPersonasResponseSchema } from "@kaja/schema/nasi"
import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog"
import { ErrorNotice } from "../../../components/ui/ErrorNotice"
import { IconButton } from "../../../components/ui/IconButton"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { Table } from "../../../components/ui/Table"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useApiFetch } from "../../../lib/api-fetch"
import { useAppForm } from "../../../lib/form"
import { userRequired } from "../../../lib/loaders"
import { seo } from "../../../lib/seo"
import { cellActions, tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { m } from "../../../paraglide/messages.js"
import { EditWidgetDialog, parseOrigins } from "./-components/EditWidgetDialog"

export const Route = createFileRoute("/_admin/agent/widget")({
  component: WidgetPage,
  loader: ({ context }) => userRequired(context.session),
  head: () => ({ meta: seo({ title: m.nav_widget() }) })
})

const createFormSchema = z.object({
  label: z.string().min(1, m.validation_required()),
  allowedOrigins: z.string().min(1, m.validation_required()),
  widgetType: widgetTypeSchema,
  persona: z.string()
})

const AUTO_SELECT_PERSONA = ""
const DEFAULT_WIDGET_TYPE = widgetTypeSchema.options[0]
const WIDGET_TYPE_OPTIONS = widgetTypeSchema.options.map(value => ({ value, label: value }))

const columnHelper = tableColumnHelper<WidgetKey>()

function LabelCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, string>) {
  return <span className="text-fg font-bold">{info.getValue()}</span>
}

function KeyPrefixCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, string>) {
  return <span className="text-muted font-mono text-xs">{info.getValue()}…</span>
}

function OriginsCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, string[]>) {
  return <span className="text-muted font-mono text-xs">{info.getValue().join(", ")}</span>
}

function EnabledCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, boolean>) {
  return (
    <span className={info.getValue() ? "text-neon" : "text-muted"}>
      {info.getValue() ? m.widget_status_active() : m.widget_status_revoked()}
    </span>
  )
}

function CreatedAtCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, Date>) {
  return <span className="text-muted font-mono text-xs">{getTimeAgo(info.getValue())}</span>
}

function LastUsedAtCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, Date | null>) {
  const value = info.getValue()
  return <span className="text-muted font-mono text-xs">{value ? getTimeAgo(value) : m.widget_never_used()}</span>
}

type WidgetActionsMeta = Readonly<{
  personas: NasiPersonasResponse["personas"]
  isSaving: boolean
  onSave: (id: string, payload: UpdateWidgetKeyRequest) => Promise<unknown>
  onRevoke: (id: string) => void
}>

function ActionsCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, unknown>) {
  const widgetKey = info.row.original
  const { personas, isSaving, onSave, onRevoke } = cellActions<WidgetActionsMeta>(info.column.columnDef.meta)
  if (!widgetKey.enabled) return null
  return (
    <div className="flex justify-end gap-1">
      <EditWidgetDialog
        widgetKey={widgetKey}
        personas={personas}
        isPending={isSaving}
        onSave={payload => onSave(widgetKey.id, payload)}
      >
        <IconButton aria-label={m.widget_edit_title()}>
          <Pencil size={18} />
        </IconButton>
      </EditWidgetDialog>
      <ConfirmDialog
        title={m.widget_revoke_confirm_title()}
        description={m.widget_revoke_confirm_description({ label: widgetKey.label })}
        confirm={m.widget_revoke_confirm_button()}
        onConfirm={() => onRevoke(widgetKey.id)}
      >
        <IconButton variant="danger" aria-label={m.widget_revoke_confirm_button()}>
          <Trash2 size={18} />
        </IconButton>
      </ConfirmDialog>
    </div>
  )
}

function EmbedSnippet({ apiUrl, rawKey }: Readonly<{ apiUrl: string; rawKey: string }>) {
  const snippet = `<script async src="${apiUrl}/widget/${rawKey}.js"></script>`
  return (
    <div className="border-border bg-surface mt-4 rounded-lg border p-4">
      <p className="text-fg mb-2 text-sm">{m.widget_embed_notice()}</p>
      <p className="text-neon mb-3 font-mono text-sm break-all">{rawKey}</p>
      <pre className="text-muted overflow-x-auto rounded-md bg-black/40 p-3 font-mono text-xs">{snippet}</pre>
    </div>
  )
}

function WidgetPage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const { apiUrl } = useLoaderData({ from: "__root__" })
  const [justCreated, setJustCreated] = useState<CreateWidgetKeyResponse | null>(null)

  const { data, error, isLoading } = useQuery({
    queryKey: ["widget-keys"],
    queryFn: () => apiFetch<ListWidgetKeysResponse>("/widget/admin").then(r => z.array(widgetKeySchema).parse(r.keys))
  })

  // Not /admin/personas: that's admin-only, and every signed-in user can make widget keys.
  const { data: personas, error: personasError } = useQuery({
    queryKey: ["nasi", "personas"],
    queryFn: () =>
      apiFetch<NasiPersonasResponse>("/nasi/personas").then(r => NasiPersonasResponseSchema.parse(r).personas)
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["widget-keys"] })

  const createKey = useMutation({
    mutationFn: (payload: {
      label: string
      allowedOrigins: string[]
      config?: { widgetType?: string; persona?: string }
    }) => apiFetch<CreateWidgetKeyResponse>("/widget/admin", payload),
    onSuccess: response => {
      invalidate()
      setJustCreated(response)
      toast.success(m.widget_success_created())
    },
    onError: (err: Error) => toast.error(err.message || m.widget_error_create_failed())
  })

  const updateKey = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateWidgetKeyRequest }) =>
      apiFetch(`/widget/admin/${id}`, payload, { method: "PATCH" }).then(r => widgetKeySchema.parse(r)),
    onSuccess: () => {
      invalidate()
      toast.success(m.widget_success_updated())
    },
    onError: (err: Error) => toast.error(err.message || m.widget_error_update_failed())
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => apiFetch(`/widget/admin/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidate()
      toast.success(m.widget_success_revoked())
    },
    onError: (err: Error) => toast.error(err.message || m.widget_error_revoke_failed())
  })

  const form = useAppForm({
    defaultValues: { label: "", allowedOrigins: "", widgetType: DEFAULT_WIDGET_TYPE, persona: AUTO_SELECT_PERSONA },
    validators: { onSubmit: createFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createKey.mutateAsync({
        label: value.label,
        allowedOrigins: parseOrigins(value.allowedOrigins),
        config: { widgetType: value.widgetType, persona: value.persona || undefined }
      })
      formApi.reset()
    }
  })

  const columns = columnHelper.columns([
    columnHelper.accessor("label", { header: m.widget_column_label(), cell: LabelCell }),
    columnHelper.accessor("keyPrefix", {
      header: m.widget_column_key(),
      cell: KeyPrefixCell,
      enableColumnFilter: false
    }),
    columnHelper.accessor("allowedOrigins", {
      header: m.widget_column_allowed_origins(),
      cell: OriginsCell,
      enableColumnFilter: false
    }),
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
          personas: personas ?? [],
          isSaving: updateKey.isPending,
          onSave: (id, payload) => updateKey.mutateAsync({ id, payload }),
          onRevoke: id => revokeKey.mutate(id)
        } satisfies WidgetActionsMeta
      },
      cell: ActionsCell
    })
  ])

  if (isLoading) return <Loader />

  const keys = data ?? []
  const activeCount = keys.filter(k => k.enabled).length

  return (
    <>
      <PageHeader title={m.widget_title()} description={m.widget_description()}>
        <ValueBox label={m.widget_total()} variant="neon">
          {keys.length}
        </ValueBox>
        <ValueBox label={m.widget_active()}>{activeCount}</ValueBox>
      </PageHeader>

      <ErrorNotice error={error} />
      <ErrorNotice error={personasError} />

      <Section className="mb-4" title={m.widget_create_title()}>
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.AppField name="label">
            {field => (
              <field.TextField label={m.widget_field_label()} placeholder={m.widget_field_label_placeholder()} />
            )}
          </form.AppField>
          <form.AppField name="allowedOrigins">
            {field => (
              <field.TextField
                label={m.widget_field_allowed_origins()}
                placeholder={m.widget_field_allowed_origins_placeholder()}
              />
            )}
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
                  ...(personas ?? []).map(p => ({ value: p.id, label: p.label }))
                ]}
              />
            )}
          </form.AppField>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createKey.isPending}>
            {m.widget_create_button()}
          </Button>
        </form>
        {justCreated && <EmbedSnippet apiUrl={apiUrl} rawKey={justCreated.rawKey} />}
      </Section>

      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={columns} data={keys} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
