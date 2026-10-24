import type {
  CatalogModel,
  ListCatalogModelsResponse,
  ModelTask,
  UpdateCatalogModelRequest,
  UpdateCatalogProviderRequest
} from "@kaja/schema/api"
import { catalogModelSchema, catalogProviderSchema } from "@kaja/schema/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import type { CellContext, RowData } from "@tanstack/react-table"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../../components/form/primitives/Button"
import { Badge } from "../../../../components/ui/Badge"
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog"
import { ErrorNotice } from "../../../../components/ui/ErrorNotice"
import { IconButton } from "../../../../components/ui/IconButton"
import { Loader } from "../../../../components/ui/Loader"
import { PageHeader } from "../../../../components/ui/PageHeader"
import { Section } from "../../../../components/ui/Section"
import { Table } from "../../../../components/ui/Table"
import { ValueBox } from "../../../../components/ui/ValueBox"
import { useApiFetch } from "../../../../lib/api-fetch"
import { useAppForm } from "../../../../lib/form"
import { seo } from "../../../../lib/seo"
import { cellActions, tableColumnHelper, type tableFeaturesConfig } from "../../../../lib/table"
import { m } from "../../../../paraglide/messages.js"
import { TaskCheckboxes } from "../models/-components/TaskCheckboxes"
import { EditCatalogModelDialog } from "./-components/EditCatalogModelDialog"
import { ProviderSettings } from "./-components/ProviderSettings"

export const Route = createFileRoute("/_admin/admin/catalog/$providerId")({
  component: CatalogProviderPage,
  head: () => ({ meta: seo({ title: m.nav_catalog() }) })
})

const modelFormSchema = z.object({
  model: z.string().min(1, m.models_validation_required()),
  tasks: z.array(z.string()).min(1, m.models_validation_select_task()),
  images: z.boolean(),
  contextWindow: z.string().regex(/^\d*$/, m.models_validation_context_window())
})

const modelColumnHelper = tableColumnHelper<CatalogModel>()

type Cell<TData extends RowData, TValue> = CellContext<typeof tableFeaturesConfig, TData, TValue>

function ModelNameCell(info: Cell<CatalogModel, string>) {
  const model = info.row.original
  return (
    <div className="flex flex-col">
      <span className="text-fg font-mono text-sm font-bold">{model.model}</span>
      {model.name && <span className="text-muted text-xs">{model.name}</span>}
    </div>
  )
}

function TasksCell(info: Cell<CatalogModel, ModelTask[]>) {
  return <span className="text-muted text-xs">{info.getValue().join(", ") || "—"}</span>
}

function DefaultTasksCell(info: Cell<CatalogModel, ModelTask[]>) {
  const tasks = info.getValue()
  return tasks.length > 0 ? <Badge tone="ice">{tasks.join(", ")}</Badge> : <span className="text-muted">—</span>
}

function ContextCell(info: Cell<CatalogModel, number | null>) {
  const value = info.getValue()
  return <span className="text-muted font-mono text-xs">{value ? value.toLocaleString() : "—"}</span>
}

function StatusCell(info: Cell<CatalogModel, CatalogModel["status"]>) {
  const status = info.getValue()
  if (status === "removed") return <Badge>{m.catalog_status_removed()}</Badge>
  if (status === "deprecated") return <Badge>{m.catalog_status_deprecated()}</Badge>
  return null
}

function SourceCell(info: Cell<CatalogModel, string>) {
  return <span className="text-muted font-mono text-xs">{info.getValue()}</span>
}

type ModelActionsMeta = Readonly<{
  onDelete: (id: string) => void
  onSave: (id: string, payload: UpdateCatalogModelRequest) => Promise<unknown>
  isSaving: boolean
}>

function ModelActionsCell(info: Cell<CatalogModel, unknown>) {
  const model = info.row.original
  const { onDelete, onSave, isSaving } = cellActions<ModelActionsMeta>(info.column.columnDef.meta)
  return (
    <div className="flex justify-end gap-1">
      <EditCatalogModelDialog model={model} isPending={isSaving} onSave={payload => onSave(model.id, payload)}>
        <IconButton aria-label={m.catalog_edit_model_title()}>
          <Pencil size={18} />
        </IconButton>
      </EditCatalogModelDialog>
      <ConfirmDialog
        title={m.catalog_delete_model_confirm_title()}
        description={m.catalog_delete_model_confirm_description({ model: model.model })}
        confirm={m.models_delete_confirm_button()}
        onConfirm={() => onDelete(model.id)}
      >
        <IconButton variant="danger" aria-label={m.models_delete_confirm_button()}>
          <Trash2 size={18} />
        </IconButton>
      </ConfirmDialog>
    </div>
  )
}

function CatalogProviderPage() {
  const { providerId } = useParams({ from: "/_admin/admin/catalog/$providerId" })
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const providerQuery = useQuery({
    queryKey: ["catalog-provider", providerId],
    queryFn: () => apiFetch(`/admin/catalog/providers/${providerId}`).then(r => catalogProviderSchema.parse(r))
  })

  const modelsQuery = useQuery({
    queryKey: ["catalog-models", providerId],
    queryFn: () =>
      apiFetch<ListCatalogModelsResponse>(`/admin/catalog/providers/${providerId}/models`).then(r =>
        z.array(catalogModelSchema).parse(r.models)
      )
  })

  // The list's counts and defaults change with anything edited here.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["catalog-provider", providerId] })
    queryClient.invalidateQueries({ queryKey: ["catalog-models", providerId] })
    queryClient.invalidateQueries({ queryKey: ["catalog-providers"] })
  }
  const onError = (err: Error) => toast.error(err.message || m.catalog_error_save_failed())

  const updateProvider = useMutation({
    mutationFn: (payload: UpdateCatalogProviderRequest) =>
      apiFetch(`/admin/catalog/providers/${providerId}`, payload, { method: "PATCH" }).then(r =>
        catalogProviderSchema.parse(r)
      ),
    onSuccess: () => {
      invalidate()
      toast.success(m.catalog_saved())
    },
    onError
  })

  const deleteProvider = useMutation({
    mutationFn: () => apiFetch(`/admin/catalog/providers/${providerId}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalog-providers"] })
      navigate({ to: "/admin/catalog" })
    },
    onError
  })

  const createModel = useMutation({
    mutationFn: (payload: { model: string; tasks: ModelTask[]; images: boolean; contextWindow: number | null }) =>
      apiFetch(`/admin/catalog/providers/${providerId}/models`, payload).then(r => catalogModelSchema.parse(r)),
    onSuccess: () => {
      invalidate()
      toast.success(m.catalog_saved())
    },
    onError
  })

  const updateModel = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCatalogModelRequest }) =>
      apiFetch(`/admin/catalog/models/${id}`, payload, { method: "PATCH" }).then(r => catalogModelSchema.parse(r)),
    onSuccess: invalidate,
    onError
  })

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/catalog/models/${id}`, undefined, { method: "DELETE" }),
    onSuccess: invalidate,
    onError
  })

  const modelForm = useAppForm({
    defaultValues: { model: "", tasks: ["chat"] as string[], images: false, contextWindow: "" },
    validators: { onSubmit: modelFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createModel.mutateAsync({
        model: value.model.trim(),
        tasks: value.tasks as ModelTask[],
        images: value.images,
        contextWindow: Number(value.contextWindow) || null
      })
      formApi.reset()
    }
  })

  const modelColumns = modelColumnHelper.columns([
    modelColumnHelper.accessor("model", { header: m.catalog_column_model(), cell: ModelNameCell }),
    modelColumnHelper.accessor("tasks", {
      header: m.catalog_column_tasks(),
      cell: TasksCell,
      filterFn: "arrIncludes",
      meta: { filterVariant: "task" }
    }),
    modelColumnHelper.accessor("defaultTasks", {
      header: m.catalog_column_default(),
      cell: DefaultTasksCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("contextWindow", {
      header: m.catalog_column_context(),
      cell: ContextCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("status", {
      header: m.catalog_column_status(),
      cell: StatusCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("source", {
      header: m.catalog_column_source(),
      cell: SourceCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.display({
      id: "actions",
      header: "",
      meta: {
        actions: {
          onDelete: id => deleteModel.mutate(id),
          onSave: (id, payload) => updateModel.mutateAsync({ id, payload }),
          isSaving: updateModel.isPending
        } satisfies ModelActionsMeta
      },
      cell: ModelActionsCell
    })
  ])

  if (providerQuery.isLoading) return <Loader />
  const provider = providerQuery.data
  if (!provider) return <ErrorNotice error={providerQuery.error} />

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Link
              to="/admin/catalog"
              aria-label={m.catalog_back_to_list()}
              className="border-border bg-surface text-muted hover:border-neon/40 hover:text-fg inline-flex rounded-md border p-1.5 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            {provider.name}
          </span>
        }
        description={m.catalog_provider_description()}
        meta={provider.slug}
      >
        <ValueBox label={m.catalog_column_models()} variant="neon">
          {provider.modelCount}
        </ValueBox>
        <ValueBox label={m.catalog_column_defaults()}>{provider.defaultTasks.length}</ValueBox>
      </PageHeader>

      <Section title={m.catalog_provider_settings_title()}>
        {/* Keyed by its last save, so the form picks up what the server stored */}
        <ProviderSettings
          key={provider.updatedAt.toISOString()}
          provider={provider}
          isPending={updateProvider.isPending}
          onSave={payload => updateProvider.mutateAsync(payload)}
        />
        <div className="border-border mt-6 flex items-center justify-between gap-4 border-t pt-4">
          <p className="text-muted m-0 text-sm">
            {provider.doc && (
              <a href={provider.doc} target="_blank" rel="noreferrer" className="text-neon underline">
                {provider.doc}
              </a>
            )}
          </p>
          <ConfirmDialog
            title={m.catalog_delete_provider_confirm_title()}
            description={m.catalog_delete_provider_confirm_description({ name: provider.name })}
            confirm={m.models_delete_confirm_button()}
            onConfirm={() => deleteProvider.mutate()}
          >
            <Button variant="secondary">{m.catalog_delete_provider_button()}</Button>
          </ConfirmDialog>
        </div>
      </Section>

      <Section title={m.catalog_add_model_title()}>
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault()
            modelForm.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <modelForm.AppField name="model">
            {field => <field.TextField label={m.catalog_field_model()} />}
          </modelForm.AppField>
          <modelForm.AppField name="contextWindow">
            {field => (
              <field.TextField
                label={m.models_field_context_window()}
                placeholder={m.models_field_context_window_placeholder()}
                inputMode="numeric"
              />
            )}
          </modelForm.AppField>
          <modelForm.AppField name="tasks">
            {field => (
              <div className="sm:col-span-2 md:flex">
                <span className="flex w-48 items-center">{m.catalog_field_tasks()}</span>
                <TaskCheckboxes value={field.state.value} onChange={value => field.handleChange(value)} />
              </div>
            )}
          </modelForm.AppField>
          <modelForm.AppField name="images">
            {field => <field.CheckboxField label={m.catalog_field_images()} className="sm:col-span-2" />}
          </modelForm.AppField>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createModel.isPending}>
            {m.catalog_add_model_title()}
          </Button>
        </form>
      </Section>

      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <ErrorNotice error={modelsQuery.error} />
          {modelsQuery.isLoading ? (
            <Loader />
          ) : (
            <Table columns={modelColumns} data={modelsQuery.data ?? []} sorting={[]} />
          )}
        </div>
      </Section>
    </div>
  )
}
