import { CheckboxGroup } from "@base-ui/react/checkbox-group"
import { Field } from "@base-ui/react/field"
import type { ListModelsResponse, ListProvidersResponse, Model, ModelTask, Provider } from "@kaja/schema/api"
import { modelSchema, providerSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import { Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { Checkbox } from "../../../components/form/primitives/Checkbox"
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
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/models/")({
  component: ModelsPage,
  loader: () => userRequired("admin"),
  head: () => ({ meta: seo({ title: m.nav_models() }) })
})

const MODEL_TASKS: ModelTask[] = ["chat", "tts", "stt", "embedding", "image-generation", "rerank"]

const providerFormSchema = z.object({
  name: z.string().min(1, m.models_validation_required()),
  baseUrl: z.url(m.models_validation_invalid_url()),
  apiKey: z.string()
})

const modelFormSchema = z.object({
  providerId: z.string().min(1, m.models_validation_required()),
  model: z.string().min(1, m.models_validation_required()),
  tasks: z.array(z.string()).min(1, m.models_validation_select_task()),
  free: z.boolean()
})

const providerColumnHelper = tableColumnHelper<Provider>()
const modelColumnHelper = tableColumnHelper<Model>()

function ProviderNameCell(info: CellContext<typeof tableFeaturesConfig, Provider, string>) {
  return <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
}

function ProviderBaseUrlCell(info: CellContext<typeof tableFeaturesConfig, Provider, string>) {
  return <span className="font-mono text-xs text-muted">{info.getValue()}</span>
}

function ProviderApiKeyCell(info: CellContext<typeof tableFeaturesConfig, Provider, string>) {
  return <span className="text-xs text-muted">{info.getValue() ? m.models_column_api_key_set() : "—"}</span>
}

function ProviderCreatedAtCell(info: CellContext<typeof tableFeaturesConfig, Provider, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function makeProviderActionsCell(onDelete: (id: string) => void) {
  return function ProviderActionsCell(info: { row: { original: Provider } }) {
    return (
      <div className="text-right">
        <ConfirmDialog
          title={m.models_delete_provider_confirm_title()}
          description={m.models_delete_provider_confirm_description({ name: info.row.original.name })}
          confirm={m.models_delete_confirm_button()}
          onConfirm={() => onDelete(info.row.original.id)}
        >
          <IconButton variant="danger" aria-label={m.models_delete_confirm_button()}>
            <Trash2 size={18} />
          </IconButton>
        </ConfirmDialog>
      </div>
    )
  }
}

function ModelNameCell(info: CellContext<typeof tableFeaturesConfig, Model, string>) {
  return <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
}

function ModelTasksCell(info: CellContext<typeof tableFeaturesConfig, Model, ModelTask[]>) {
  return <span className="text-xs text-muted">{info.getValue().join(", ")}</span>
}

function makeModelProviderCell(providers: Provider[]) {
  return function ModelProviderCell(info: CellContext<typeof tableFeaturesConfig, Model, string>) {
    const provider = providers.find(p => p.id === info.getValue())
    return <span className="font-mono text-xs text-muted">{provider?.name ?? "—"}</span>
  }
}

function makeModelEnabledCell(onToggle: (args: { id: string; enabled: boolean }) => void) {
  return function ModelEnabledCell(info: CellContext<typeof tableFeaturesConfig, Model, boolean>) {
    const model = info.row.original
    return (
      <Checkbox
        checked={info.getValue()}
        aria-label={m.models_toggle_enabled({ model: model.model })}
        onCheckedChange={enabled => onToggle({ id: model.id, enabled })}
      />
    )
  }
}

function makeModelFreeCell(onToggle: (args: { id: string; free: boolean }) => void) {
  return function ModelFreeCell(info: CellContext<typeof tableFeaturesConfig, Model, boolean>) {
    const model = info.row.original
    return (
      <Checkbox
        checked={info.getValue()}
        aria-label={m.models_toggle_free({ model: model.model })}
        onCheckedChange={free => onToggle({ id: model.id, free })}
      />
    )
  }
}

function ModelCreatedAtCell(info: CellContext<typeof tableFeaturesConfig, Model, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function makeModelActionsCell(onDelete: (id: string) => void) {
  return function ModelActionsCell(info: { row: { original: Model } }) {
    return (
      <div className="text-right">
        <ConfirmDialog
          title={m.models_delete_model_confirm_title()}
          description={m.models_delete_model_confirm_description({ model: info.row.original.model })}
          confirm={m.models_delete_confirm_button()}
          onConfirm={() => onDelete(info.row.original.id)}
        >
          <IconButton variant="danger" aria-label={m.models_delete_confirm_button()}>
            <Trash2 size={18} />
          </IconButton>
        </ConfirmDialog>
      </div>
    )
  }
}

function ModelsPage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () =>
      apiFetch<ListProvidersResponse>("/admin/providers").then(r => z.array(providerSchema).parse(r.providers))
  })

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => apiFetch<ListModelsResponse>("/admin/models").then(r => z.array(modelSchema).parse(r.models))
  })

  const invalidateProviders = () => queryClient.invalidateQueries({ queryKey: ["providers"] })
  const invalidateModels = () => queryClient.invalidateQueries({ queryKey: ["models"] })

  const createProvider = useMutation({
    mutationFn: (payload: { name: string; baseUrl: string; apiKey?: string }) =>
      apiFetch("/admin/providers", payload).then(r => providerSchema.parse(r)),
    onSuccess: () => {
      invalidateProviders()
      toast.success(m.models_success_provider_created())
    },
    onError: (err: Error) => toast.error(err.message || m.models_error_provider_create_failed())
  })

  const deleteProvider = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/providers/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidateProviders()
      invalidateModels()
      toast.success(m.models_success_provider_deleted())
    },
    onError: (err: Error) => toast.error(err.message || m.models_error_provider_delete_failed())
  })

  const createModel = useMutation({
    mutationFn: (payload: { providerId: string; model: string; tasks: ModelTask[]; free: boolean }) =>
      apiFetch("/admin/models", { ...payload, enabled: true }).then(r => modelSchema.parse(r)),
    onSuccess: () => {
      invalidateModels()
      toast.success(m.models_success_model_created())
    },
    onError: (err: Error) => toast.error(err.message || m.models_error_model_create_failed())
  })

  const toggleModelEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/admin/models/${id}`, { enabled }, { method: "PATCH" }).then(r => modelSchema.parse(r)),
    onSuccess: invalidateModels,
    onError: (err: Error) => toast.error(err.message || m.models_error_model_update_failed())
  })

  const toggleModelFree = useMutation({
    mutationFn: ({ id, free }: { id: string; free: boolean }) =>
      apiFetch(`/admin/models/${id}`, { free }, { method: "PATCH" }).then(r => modelSchema.parse(r)),
    onSuccess: invalidateModels,
    onError: (err: Error) => toast.error(err.message || m.models_error_model_update_failed())
  })

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/models/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidateModels()
      toast.success(m.models_success_model_deleted())
    },
    onError: (err: Error) => toast.error(err.message || m.models_error_model_delete_failed())
  })

  const providerForm = useAppForm({
    defaultValues: { name: "", baseUrl: "", apiKey: "" },
    validators: { onSubmit: providerFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createProvider.mutateAsync({
        name: value.name,
        baseUrl: value.baseUrl,
        apiKey: value.apiKey || undefined
      })
      formApi.reset()
    }
  })

  const providers = providersQuery.data ?? []

  const modelForm = useAppForm({
    defaultValues: {
      providerId: providers[0]?.id ?? "",
      model: "",
      tasks: ["chat"] as string[],
      free: false
    },
    validators: { onSubmit: modelFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createModel.mutateAsync({
        providerId: value.providerId,
        model: value.model,
        tasks: value.tasks as ModelTask[],
        free: value.free
      })
      formApi.reset()
    }
  })

  const providerColumns = providerColumnHelper.columns([
    providerColumnHelper.accessor("name", {
      header: m.models_column_provider_name(),
      cell: ProviderNameCell
    }),
    providerColumnHelper.accessor("baseUrl", {
      header: m.models_column_base_url(),
      cell: ProviderBaseUrlCell
    }),
    providerColumnHelper.accessor("apiKey", {
      header: m.models_column_api_key(),
      cell: ProviderApiKeyCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("createdAt", {
      header: m.models_column_created(),
      cell: ProviderCreatedAtCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.display({
      id: "actions",
      header: "",
      cell: makeProviderActionsCell(id => deleteProvider.mutate(id))
    })
  ])

  const modelColumns = modelColumnHelper.columns([
    modelColumnHelper.accessor("model", {
      header: m.models_column_model(),
      cell: ModelNameCell
    }),
    modelColumnHelper.accessor("tasks", {
      header: m.models_column_tasks(),
      cell: ModelTasksCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("providerId", {
      header: m.models_column_provider(),
      cell: makeModelProviderCell(providers),
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("enabled", {
      header: m.models_enabled(),
      cell: makeModelEnabledCell(args => toggleModelEnabled.mutate(args)),
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("free", {
      header: m.models_column_free(),
      cell: makeModelFreeCell(args => toggleModelFree.mutate(args)),
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("createdAt", {
      header: m.models_column_created(),
      cell: ModelCreatedAtCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.display({
      id: "actions",
      header: "",
      cell: makeModelActionsCell(id => deleteModel.mutate(id))
    })
  ])

  if (providersQuery.isLoading || modelsQuery.isLoading) return <Loader />

  const models = modelsQuery.data ?? []
  const enabledCount = models.filter(m => m.enabled).length
  const freeCount = models.filter(m => m.free).length

  return (
    <>
      <PageHeader
        title={m.models_title()}
        description={m.models_description({ modelsToml: "models.toml", endpoint: "GET /config/models" })}
        meta={m.models_meta()}
      >
        <ValueBox label={m.models_providers()} variant="neon">
          {providers.length}
        </ValueBox>
        <ValueBox label={m.models_models()}>{models.length}</ValueBox>
        <ValueBox label={m.models_enabled()}>{enabledCount}</ValueBox>
        <ValueBox label={m.models_free()}>{freeCount}</ValueBox>
      </PageHeader>

      <ErrorNotice error={providersQuery.error} />
      <ErrorNotice error={modelsQuery.error} />

      <Section className="mb-4" title={m.models_add_provider_title()}>
        <form
          onSubmit={e => {
            e.preventDefault()
            providerForm.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <providerForm.AppField name="name">
            {field => (
              <field.TextField
                label={m.models_field_provider_name()}
                placeholder={m.models_field_provider_name_placeholder()}
              />
            )}
          </providerForm.AppField>
          <providerForm.AppField name="baseUrl">
            {field => (
              <field.TextField label={m.models_field_base_url()} placeholder="https://api.fireworks.ai/inference/v1" />
            )}
          </providerForm.AppField>
          <providerForm.AppField name="apiKey">
            {field => <field.TextField label={m.models_field_api_key()} placeholder="fw_YourSecretKey" />}
          </providerForm.AppField>
          <Button type="submit" className="justify-self-start sm:col-span-3" loading={createProvider.isPending}>
            {m.models_add_provider_button()}
          </Button>
        </form>
      </Section>

      <Section className="mb-4" padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={providerColumns} data={providers} showFilters={false} />
        </div>
      </Section>

      <Section className="mb-4" title={m.models_add_model_title()}>
        {providers.length === 0 ? (
          <p className="text-muted text-sm">{m.models_add_model_needs_provider()}</p>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault()
              modelForm.handleSubmit()
            }}
            className="grid gap-4 sm:grid-cols-3"
          >
            <modelForm.AppField name="providerId">
              {field => (
                <field.SelectField
                  label={m.models_field_provider()}
                  options={providers.map(p => ({ value: p.id, label: p.name }))}
                />
              )}
            </modelForm.AppField>
            <modelForm.AppField name="model">
              {field => (
                <field.TextField label={m.models_field_model()} placeholder="accounts/fireworks/models/minimax-m3" />
              )}
            </modelForm.AppField>
            <modelForm.AppField name="tasks">
              {field => (
                <div className="sm:col-span-3 md:flex">
                  <span className="flex w-48 items-center justify-between align-middle">{m.models_field_tasks()}</span>
                  <CheckboxGroup
                    value={field.state.value}
                    onValueChange={value => field.handleChange(value)}
                    className="flex flex-wrap gap-x-4 gap-y-2"
                  >
                    {MODEL_TASKS.map(task => (
                      <Field.Root key={task} name={task} className="flex items-center gap-2 text-fg text-sm">
                        <Field.Label className="flex items-center gap-2">
                          <Checkbox name={task} />
                          {task}
                        </Field.Label>
                      </Field.Root>
                    ))}
                  </CheckboxGroup>
                </div>
              )}
            </modelForm.AppField>
            <modelForm.AppField name="free">
              {field => <field.CheckboxField label={m.models_field_free()} className="sm:col-span-3" />}
            </modelForm.AppField>
            <Button type="submit" className="justify-self-start sm:col-span-3" loading={createModel.isPending}>
              {m.models_add_model_button()}
            </Button>
          </form>
        )}
      </Section>

      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={modelColumns} data={models} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
