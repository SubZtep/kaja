import type {
  CatalogModel,
  CatalogProvider,
  CatalogSyncResult,
  ListCatalogModelsResponse,
  ListCatalogProvidersResponse,
  ModelTask,
  UpdateCatalogModelRequest,
  UpdateCatalogProviderRequest
} from "@kaja/schema/api"
import {
  catalogModelSchema,
  catalogProviderSchema,
  catalogSyncResultSchema,
  catalogSyncStatusSchema
} from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { CellContext, RowData } from "@tanstack/react-table"
import { List, Pencil, ServerCog, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../../components/form/primitives/Button"
import { Checkbox } from "../../../../components/form/primitives/Checkbox"
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
import { EditCatalogProviderDialog, kindOptions } from "./-components/EditCatalogProviderDialog"

export const Route = createFileRoute("/_admin/admin/catalog/")({
  component: CatalogPage,
  head: () => ({ meta: seo({ title: m.nav_catalog() }) })
})

const providerFormSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, m.catalog_validation_slug()),
  name: z.string().min(1, m.models_validation_required()),
  kind: z.enum(["hosted", "self-hosted"]),
  baseUrl: z.url(m.models_validation_invalid_url())
})

const modelFormSchema = z.object({
  model: z.string().min(1, m.models_validation_required()),
  tasks: z.array(z.string()).min(1, m.models_validation_select_task()),
  images: z.boolean(),
  contextWindow: z.string().regex(/^\d*$/, m.models_validation_context_window())
})

const providerColumnHelper = tableColumnHelper<CatalogProvider>()
const modelColumnHelper = tableColumnHelper<CatalogModel>()

type Cell<TData extends RowData, TValue> = CellContext<typeof tableFeaturesConfig, TData, TValue>

type ListedMeta = Readonly<{ onToggle: (args: { id: string; listed: boolean }) => void }>

function ListedCell(info: Cell<CatalogProvider, boolean>) {
  const provider = info.row.original
  const { onToggle } = cellActions<ListedMeta>(info.column.columnDef.meta)
  return (
    <Checkbox
      checked={provider.listed}
      aria-label={m.catalog_toggle_listed({ name: provider.name })}
      onCheckedChange={listed => onToggle({ id: provider.id, listed })}
    />
  )
}

function ProviderNameCell(info: Cell<CatalogProvider, string>) {
  const provider = info.row.original
  return (
    <div className="flex flex-col">
      <span className="text-fg text-sm font-bold">{provider.name}</span>
      <span className="text-muted font-mono text-xs">{provider.slug}</span>
    </div>
  )
}

function AddressCell(info: Cell<CatalogProvider, unknown>) {
  const provider = info.row.original
  const address = provider.baseUrl ?? provider.apiUrl
  if (!address) return <Badge>{m.catalog_no_address()}</Badge>
  return <span className="text-muted font-mono text-xs">{address}</span>
}

function MutedCell(info: Cell<CatalogProvider, string | number>) {
  return <span className="text-muted font-mono text-xs">{info.getValue()}</span>
}

function DefaultsCell(info: Cell<CatalogProvider, ModelTask[]>) {
  return <span className="text-muted text-xs">{info.getValue().join(", ") || "—"}</span>
}

type ProviderActionsMeta = Readonly<{
  onShowModels: (id: string) => void
  onDelete: (id: string) => void
  onSave: (id: string, payload: UpdateCatalogProviderRequest) => Promise<unknown>
  isSaving: boolean
}>

function ProviderActionsCell(info: Cell<CatalogProvider, unknown>) {
  const provider = info.row.original
  const { onShowModels, onDelete, onSave, isSaving } = cellActions<ProviderActionsMeta>(info.column.columnDef.meta)
  return (
    <div className="flex justify-end gap-1">
      <IconButton aria-label={m.catalog_show_models({ name: provider.name })} onClick={() => onShowModels(provider.id)}>
        <List size={18} />
      </IconButton>
      <EditCatalogProviderDialog
        provider={provider}
        isPending={isSaving}
        onSave={payload => onSave(provider.id, payload)}
      >
        <IconButton aria-label={m.catalog_edit_provider_title()}>
          <Pencil size={18} />
        </IconButton>
      </EditCatalogProviderDialog>
      <ConfirmDialog
        title={m.catalog_delete_provider_confirm_title()}
        description={m.catalog_delete_provider_confirm_description({ name: provider.name })}
        confirm={m.models_delete_confirm_button()}
        onConfirm={() => onDelete(provider.id)}
      >
        <IconButton variant="danger" aria-label={m.models_delete_confirm_button()}>
          <Trash2 size={18} />
        </IconButton>
      </ConfirmDialog>
    </div>
  )
}

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
  onAddToFleet: (id: string) => void
  onDelete: (id: string) => void
  onSave: (id: string, payload: UpdateCatalogModelRequest) => Promise<unknown>
  isSaving: boolean
}>

function ModelActionsCell(info: Cell<CatalogModel, unknown>) {
  const model = info.row.original
  const { onAddToFleet, onDelete, onSave, isSaving } = cellActions<ModelActionsMeta>(info.column.columnDef.meta)
  return (
    <div className="flex justify-end gap-1">
      <IconButton aria-label={m.catalog_add_to_fleet()} onClick={() => onAddToFleet(model.id)}>
        <ServerCog size={18} />
      </IconButton>
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

function syncMessage(result: CatalogSyncResult): string {
  if (!result.changed) return m.catalog_sync_unchanged()
  return m.catalog_sync_done({
    added: result.models.added,
    updated: result.models.updated,
    removed: result.models.removed
  })
}

function CatalogPage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string>()

  const providersQuery = useQuery({
    queryKey: ["catalog-providers"],
    queryFn: () =>
      apiFetch<ListCatalogProvidersResponse>("/admin/catalog/providers").then(r =>
        z.array(catalogProviderSchema).parse(r.providers)
      )
  })

  const syncQuery = useQuery({
    queryKey: ["catalog-sync"],
    queryFn: () => apiFetch("/admin/catalog/sync").then(r => catalogSyncStatusSchema.parse(r))
  })

  const modelsQuery = useQuery({
    queryKey: ["catalog-models", selectedId],
    enabled: selectedId !== undefined,
    queryFn: () =>
      apiFetch<ListCatalogModelsResponse>(`/admin/catalog/providers/${selectedId}/models`).then(r =>
        z.array(catalogModelSchema).parse(r.models)
      )
  })

  const invalidateProviders = () => queryClient.invalidateQueries({ queryKey: ["catalog-providers"] })
  const invalidateModels = () => queryClient.invalidateQueries({ queryKey: ["catalog-models"] })
  const onError = (err: Error) => toast.error(err.message || m.catalog_error_save_failed())

  const sync = useMutation({
    mutationFn: () => apiFetch("/admin/catalog/sync", {}).then(r => catalogSyncResultSchema.parse(r)),
    onSuccess: result => {
      invalidateProviders()
      invalidateModels()
      toast.success(syncMessage(result))
    },
    onError,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["catalog-sync"] })
  })

  const createProvider = useMutation({
    mutationFn: (payload: z.infer<typeof providerFormSchema>) =>
      apiFetch("/admin/catalog/providers", payload).then(r => catalogProviderSchema.parse(r)),
    onSuccess: provider => {
      invalidateProviders()
      setSelectedId(provider.id)
      toast.success(m.catalog_saved())
    },
    onError
  })

  const updateProvider = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCatalogProviderRequest }) =>
      apiFetch(`/admin/catalog/providers/${id}`, payload, { method: "PATCH" }).then(r =>
        catalogProviderSchema.parse(r)
      ),
    onSuccess: invalidateProviders,
    onError
  })

  const deleteProvider = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/catalog/providers/${id}`, undefined, { method: "DELETE" }),
    onSuccess: (_, id) => {
      if (id === selectedId) setSelectedId(undefined)
      invalidateProviders()
    },
    onError
  })

  const createModel = useMutation({
    mutationFn: (payload: { model: string; tasks: ModelTask[]; images: boolean; contextWindow: number | null }) =>
      apiFetch(`/admin/catalog/providers/${selectedId}/models`, payload).then(r => catalogModelSchema.parse(r)),
    onSuccess: () => {
      invalidateModels()
      invalidateProviders()
      toast.success(m.catalog_saved())
    },
    onError
  })

  const updateModel = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCatalogModelRequest }) =>
      apiFetch(`/admin/catalog/models/${id}`, payload, { method: "PATCH" }).then(r => catalogModelSchema.parse(r)),
    onSuccess: () => {
      invalidateModels()
      invalidateProviders()
    },
    onError
  })

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/catalog/models/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidateModels()
      invalidateProviders()
    },
    onError
  })

  const addToFleet = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/catalog/models/${id}/fleet`, {}),
    onSuccess: () => toast.success(m.catalog_added_to_fleet()),
    onError
  })

  const providerForm = useAppForm({
    defaultValues: { slug: "", name: "", kind: "self-hosted" as string, baseUrl: "" },
    validators: { onSubmit: providerFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createProvider.mutateAsync({
        slug: value.slug.trim(),
        name: value.name.trim(),
        kind: value.kind as CatalogProvider["kind"],
        baseUrl: value.baseUrl.trim()
      })
      formApi.reset()
    }
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

  const providerColumns = providerColumnHelper.columns([
    providerColumnHelper.accessor("listed", {
      header: m.catalog_column_listed(),
      meta: {
        actions: {
          onToggle: ({ id, listed }) => updateProvider.mutate({ id, payload: { listed } })
        } satisfies ListedMeta
      },
      cell: ListedCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("name", { header: m.catalog_column_provider(), cell: ProviderNameCell }),
    providerColumnHelper.accessor("kind", {
      header: m.catalog_column_kind(),
      cell: MutedCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.display({ id: "address", header: m.catalog_column_address(), cell: AddressCell }),
    providerColumnHelper.accessor("modelCount", {
      header: m.catalog_column_models(),
      cell: MutedCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("defaultTasks", {
      header: m.catalog_column_defaults(),
      cell: DefaultsCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("position", {
      header: m.catalog_column_order(),
      cell: MutedCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("source", {
      header: m.catalog_column_source(),
      cell: MutedCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.display({
      id: "actions",
      header: "",
      meta: {
        actions: {
          onShowModels: setSelectedId,
          onDelete: id => deleteProvider.mutate(id),
          onSave: (id, payload) => updateProvider.mutateAsync({ id, payload }),
          isSaving: updateProvider.isPending
        } satisfies ProviderActionsMeta
      },
      cell: ProviderActionsCell
    })
  ])

  const modelColumns = modelColumnHelper.columns([
    modelColumnHelper.accessor("model", { header: m.catalog_column_model(), cell: ModelNameCell }),
    modelColumnHelper.accessor("tasks", {
      header: m.catalog_column_tasks(),
      cell: TasksCell,
      enableColumnFilter: false
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
          onAddToFleet: id => addToFleet.mutate(id),
          onDelete: id => deleteModel.mutate(id),
          onSave: (id, payload) => updateModel.mutateAsync({ id, payload }),
          isSaving: updateModel.isPending
        } satisfies ModelActionsMeta
      },
      cell: ModelActionsCell
    })
  ])

  if (providersQuery.isLoading) return <Loader />

  const providers = providersQuery.data ?? []
  const selected = providers.find(provider => provider.id === selectedId)
  const syncedAt = syncQuery.data?.syncedAt

  return (
    <>
      <PageHeader
        title={m.catalog_title()}
        description={m.catalog_description({ endpoint: "GET /config/catalog" })}
        meta={m.catalog_meta()}
      >
        <ValueBox label={m.catalog_listed()} variant="neon">
          {providers.filter(provider => provider.listed).length}
        </ValueBox>
        <ValueBox label={m.catalog_providers()}>{providers.length}</ValueBox>
        <ValueBox label={m.catalog_last_sync()}>{syncedAt ? getTimeAgo(syncedAt) : m.catalog_never_synced()}</ValueBox>
      </PageHeader>

      <ErrorNotice error={providersQuery.error} />
      {syncQuery.data?.error && (
        <Section className="mb-4" tone="danger">
          <p className="m-0 text-sm">{m.catalog_sync_error({ error: syncQuery.data.error })}</p>
        </Section>
      )}

      <div className="mb-4 flex justify-end">
        <Button loading={sync.isPending} onClick={() => sync.mutate()}>
          {m.catalog_sync_button()}
        </Button>
      </div>

      <Section className="mb-4" title={m.catalog_add_provider_title()}>
        <form
          noValidate
          onSubmit={e => {
            e.preventDefault()
            providerForm.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <providerForm.AppField name="slug">
            {field => <field.TextField label={m.catalog_field_slug()} placeholder="ollama" />}
          </providerForm.AppField>
          <providerForm.AppField name="name">
            {field => <field.TextField label={m.catalog_field_name()} placeholder="Ollama" />}
          </providerForm.AppField>
          <providerForm.AppField name="kind">
            {field => <field.SelectField label={m.catalog_field_kind()} options={kindOptions()} />}
          </providerForm.AppField>
          <providerForm.AppField name="baseUrl">
            {field => <field.TextField label={m.catalog_field_base_url()} placeholder="http://localhost:11434/v1" />}
          </providerForm.AppField>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createProvider.isPending}>
            {m.catalog_add_provider_title()}
          </Button>
        </form>
      </Section>

      <Section className="mb-4" padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={providerColumns} data={providers} sorting={[]} />
        </div>
      </Section>

      <Section title={selected ? m.catalog_models_title({ name: selected.name }) : undefined}>
        {selected ? (
          <>
            <ErrorNotice error={modelsQuery.error} />
            <form
              noValidate
              onSubmit={e => {
                e.preventDefault()
                modelForm.handleSubmit()
              }}
              className="mb-6 grid gap-4 sm:grid-cols-2"
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
            {modelsQuery.isLoading ? (
              <Loader />
            ) : (
              <Table columns={modelColumns} data={modelsQuery.data ?? []} sorting={[]} />
            )}
          </>
        ) : (
          <p className="text-muted m-0 text-sm">{m.catalog_models_pick_provider()}</p>
        )}
      </Section>
    </>
  )
}
