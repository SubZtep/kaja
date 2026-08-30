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
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { Table } from "../../../components/ui/Table"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useApiFetch } from "../../../lib/api-fetch"
import { useAppForm } from "../../../lib/form"
import { userRequired } from "../../../lib/loaders"
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"

export const Route = createFileRoute("/_admin/models/")({
  component: ModelsPage,
  loader: () => userRequired("admin")
})

const MODEL_TASKS: ModelTask[] = ["chat", "text-to-speech", "speech-to-text", "embedding", "image-generation", "rerank"]

const providerFormSchema = z.object({
  name: z.string().min(1, "Required"),
  baseUrl: z.url("Must be a valid URL"),
  apiKey: z.string()
})

const modelFormSchema = z.object({
  providerId: z.string().min(1, "Required"),
  model: z.string().min(1, "Required"),
  tasks: z.array(z.string()).min(1, "Select at least one task"),
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
  return <span className="text-xs text-muted">{info.getValue() ? "•••• set" : "—"}</span>
}

function ProviderCreatedAtCell(info: CellContext<typeof tableFeaturesConfig, Provider, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function makeProviderActionsCell(onDelete: (id: string) => void) {
  return function ProviderActionsCell(info: { row: { original: Provider } }) {
    return (
      <div className="text-right">
        <ConfirmDialog
          title="Delete provider?"
          description={`This will remove "${info.row.original.name}" and any models using it from the generated models.toml.`}
          confirm="Delete"
          onConfirm={() => onDelete(info.row.original.id)}
        >
          <button type="button" className="inline-flex rounded-lg p-2 text-red-400 transition-all hover:bg-red-400/10">
            <Trash2 size={18} />
          </button>
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
    return <Checkbox checked={info.getValue()} onCheckedChange={enabled => onToggle({ id: model.id, enabled })} />
  }
}

function makeModelFreeCell(onToggle: (args: { id: string; free: boolean }) => void) {
  return function ModelFreeCell(info: CellContext<typeof tableFeaturesConfig, Model, boolean>) {
    const model = info.row.original
    return <Checkbox checked={info.getValue()} onCheckedChange={free => onToggle({ id: model.id, free })} />
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
          title="Delete model?"
          description={`This will remove "${info.row.original.model}" from the generated models.toml.`}
          confirm="Delete"
          onConfirm={() => onDelete(info.row.original.id)}
        >
          <button type="button" className="inline-flex rounded-lg p-2 text-red-400 transition-all hover:bg-red-400/10">
            <Trash2 size={18} />
          </button>
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
      toast.success("Provider created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create provider")
  })

  const deleteProvider = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/providers/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidateProviders()
      invalidateModels()
      toast.success("Provider deleted")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete provider")
  })

  const createModel = useMutation({
    mutationFn: (payload: { providerId: string; model: string; tasks: ModelTask[]; free: boolean }) =>
      apiFetch("/admin/models", { ...payload, enabled: true }).then(r => modelSchema.parse(r)),
    onSuccess: () => {
      invalidateModels()
      toast.success("Model created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create model")
  })

  const toggleModelEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/admin/models/${id}`, { enabled }, { method: "PATCH" }).then(r => modelSchema.parse(r)),
    onSuccess: invalidateModels,
    onError: (err: Error) => toast.error(err.message || "Failed to update model")
  })

  const toggleModelFree = useMutation({
    mutationFn: ({ id, free }: { id: string; free: boolean }) =>
      apiFetch(`/admin/models/${id}`, { free }, { method: "PATCH" }).then(r => modelSchema.parse(r)),
    onSuccess: invalidateModels,
    onError: (err: Error) => toast.error(err.message || "Failed to update model")
  })

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/models/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidateModels()
      toast.success("Model deleted")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete model")
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
      header: "Name",
      cell: ProviderNameCell
    }),
    providerColumnHelper.accessor("baseUrl", {
      header: "Base URL",
      cell: ProviderBaseUrlCell
    }),
    providerColumnHelper.accessor("apiKey", {
      header: "API Key",
      cell: ProviderApiKeyCell,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("createdAt", {
      header: "Created",
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
      header: "Model",
      cell: ModelNameCell
    }),
    modelColumnHelper.accessor("tasks", {
      header: "Tasks",
      cell: ModelTasksCell,
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("providerId", {
      header: "Provider",
      cell: makeModelProviderCell(providers),
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("enabled", {
      header: "Enabled",
      cell: makeModelEnabledCell(args => toggleModelEnabled.mutate(args)),
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("free", {
      header: "Free",
      cell: makeModelFreeCell(args => toggleModelFree.mutate(args)),
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("createdAt", {
      header: "Created",
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
        title="Models"
        description={
          <>
            Manage the providers and models published in the generated <code className="text-fg">models.toml</code>.
            Free models are exposed via <code className="text-fg">GET /config/models</code>.
          </>
        }
        meta="models.toml"
      >
        <ValueBox label="Providers" variant="neon">
          {providers.length}
        </ValueBox>
        <ValueBox label="Models">{models.length}</ValueBox>
        <ValueBox label="Enabled">{enabledCount}</ValueBox>
        <ValueBox label="Free">{freeCount}</ValueBox>
      </PageHeader>

      {providersQuery.error && <p className="mb-6 text-red-400 text-sm">{providersQuery.error.message}</p>}
      {modelsQuery.error && <p className="mb-6 text-red-400 text-sm">{modelsQuery.error.message}</p>}

      <Section className="mb-4">
        <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Add Provider</h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            providerForm.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <providerForm.AppField name="name">
            {field => <field.TextField label="Name" placeholder="default" />}
          </providerForm.AppField>
          <providerForm.AppField name="baseUrl">
            {field => <field.TextField label="Base URL" placeholder="https://api.fireworks.ai/inference/v1" />}
          </providerForm.AppField>
          <providerForm.AppField name="apiKey">
            {field => <field.TextField label="API Key" placeholder="fw_YourSecretKey" />}
          </providerForm.AppField>
          <Button type="submit" className="justify-self-start sm:col-span-3" loading={createProvider.isPending}>
            Add Provider
          </Button>
        </form>
      </Section>

      <Section className="mb-4" padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={providerColumns} data={providers} showFilters={false} />
        </div>
      </Section>

      <Section className="mb-4">
        <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Add Model</h2>
        {providers.length === 0 ? (
          <p className="text-muted text-sm">Add a provider first.</p>
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
                <field.SelectField label="Provider" options={providers.map(p => ({ value: p.id, label: p.name }))} />
              )}
            </modelForm.AppField>
            <modelForm.AppField name="model">
              {field => <field.TextField label="Model" placeholder="accounts/fireworks/models/minimax-m3" />}
            </modelForm.AppField>
            <modelForm.AppField name="tasks">
              {field => (
                <div className="sm:col-span-3 md:flex">
                  <span className="flex w-48 items-center justify-between align-middle">Tasks:</span>
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
              {field => <field.CheckboxField label="Free (exposed on /config/models)" className="sm:col-span-3" />}
            </modelForm.AppField>
            <Button type="submit" className="justify-self-start sm:col-span-3" loading={createModel.isPending}>
              Add Model
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
