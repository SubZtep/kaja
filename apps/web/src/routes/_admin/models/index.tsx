import { CheckboxGroup } from "@base-ui/react/checkbox-group"
import { Field } from "@base-ui/react/field"
import type { Model, ModelTask, Provider } from "@kaja/schema"
import { getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { createColumnHelper } from "@tanstack/react-table"
import { Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { Checkbox } from "../../../components/form/primitives/Checkbox"
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog"
import { Loader } from "../../../components/ui/Loader"
import { Table } from "../../../components/ui/Table"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useApiSdk } from "../../../hooks/use-api-sdk"
import { useAppForm } from "../../../lib/form"
import { userRequired } from "../../../lib/loaders"

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
  modelId: z.string().min(1, "Required"),
  tasks: z.array(z.string()).min(1, "Select at least one task")
})

const providerColumnHelper = createColumnHelper<Provider>()
const modelColumnHelper = createColumnHelper<Model>()

function ModelsPage() {
  const sdk = useApiSdk()
  const queryClient = useQueryClient()

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => sdk.providers.list()
  })

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => sdk.models.list()
  })

  const invalidateProviders = () => queryClient.invalidateQueries({ queryKey: ["providers"] })
  const invalidateModels = () => queryClient.invalidateQueries({ queryKey: ["models"] })

  const createProvider = useMutation({
    mutationFn: (payload: { name: string; baseUrl: string; apiKey?: string }) => sdk.providers.create(payload),
    onSuccess: () => {
      invalidateProviders()
      toast.success("Provider created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create provider")
  })

  const deleteProvider = useMutation({
    mutationFn: (id: string) => sdk.providers.delete(id),
    onSuccess: () => {
      invalidateProviders()
      invalidateModels()
      toast.success("Provider deleted")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete provider")
  })

  const createModel = useMutation({
    mutationFn: (payload: { providerId: string; modelId: string; tasks: ModelTask[] }) =>
      sdk.models.create({ ...payload, enabled: true }),
    onSuccess: () => {
      invalidateModels()
      toast.success("Model created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create model")
  })

  const toggleModelEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => sdk.models.update(id, { enabled }),
    onSuccess: invalidateModels,
    onError: (err: Error) => toast.error(err.message || "Failed to update model")
  })

  const deleteModel = useMutation({
    mutationFn: (id: string) => sdk.models.delete(id),
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
    defaultValues: { providerId: providers[0]?.id ?? "", modelId: "", tasks: ["chat"] as string[] },
    validators: { onSubmit: modelFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createModel.mutateAsync({
        providerId: value.providerId,
        modelId: value.modelId,
        tasks: value.tasks as ModelTask[]
      })
      formApi.reset()
    }
  })

  const providerColumns = [
    providerColumnHelper.accessor("name", {
      header: "Name",
      cell: info => <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
    }),
    providerColumnHelper.accessor("baseUrl", {
      header: "Base URL",
      cell: info => <span className="font-mono text-xs text-muted">{info.getValue()}</span>
    }),
    providerColumnHelper.accessor("apiKey", {
      header: "API Key",
      cell: info => <span className="text-xs text-muted">{info.getValue() ? "•••• set" : "—"}</span>,
      enableColumnFilter: false
    }),
    providerColumnHelper.accessor("createdAt", {
      header: "Created",
      cell: info => <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>,
      enableColumnFilter: false
    }),
    {
      id: "actions",
      header: "",
      cell: (info: { row: { original: Provider } }) => (
        <div className="text-right">
          <ConfirmDialog
            title="Delete provider?"
            description={`This will remove "${info.row.original.name}" and any models using it from the generated models.toml.`}
            confirm="Delete"
            onConfirm={() => deleteProvider.mutate(info.row.original.id)}
          >
            <button
              type="button"
              className="inline-flex rounded-lg p-2 text-red-400 transition-all hover:bg-red-400/10"
            >
              <Trash2 size={18} />
            </button>
          </ConfirmDialog>
        </div>
      )
    }
  ]

  const modelColumns = [
    modelColumnHelper.accessor("modelId", {
      header: "Model ID",
      cell: info => <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
    }),
    modelColumnHelper.accessor("tasks", {
      header: "Tasks",
      cell: info => <span className="text-xs text-muted">{info.getValue().join(", ")}</span>,
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("providerId", {
      header: "Provider",
      cell: info => {
        const provider = providers.find(p => p.id === info.getValue())
        return <span className="font-mono text-xs text-muted">{provider?.name ?? "—"}</span>
      },
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("enabled", {
      header: "Enabled",
      cell: info => {
        const model = info.row.original
        return (
          <Checkbox
            checked={info.getValue()}
            onCheckedChange={enabled => toggleModelEnabled.mutate({ id: model.id, enabled })}
          />
        )
      },
      enableColumnFilter: false
    }),
    modelColumnHelper.accessor("createdAt", {
      header: "Created",
      cell: info => <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>,
      enableColumnFilter: false
    }),
    {
      id: "actions",
      header: "",
      cell: (info: { row: { original: Model } }) => (
        <div className="text-right">
          <ConfirmDialog
            title="Delete model?"
            description={`This will remove "${info.row.original.modelId}" from the generated models.toml.`}
            confirm="Delete"
            onConfirm={() => deleteModel.mutate(info.row.original.id)}
          >
            <button
              type="button"
              className="inline-flex rounded-lg p-2 text-red-400 transition-all hover:bg-red-400/10"
            >
              <Trash2 size={18} />
            </button>
          </ConfirmDialog>
        </div>
      )
    }
  ]

  if (providersQuery.isLoading || modelsQuery.isLoading) return <Loader />

  const models = modelsQuery.data ?? []
  const enabledCount = models.filter(m => m.enabled).length

  return (
    <>
      <header className="mb-12 flex flex-col lg:flex-row justify-between lg:items-end gap-8">
        <div className="max-w-2xl">
          <h2 className="my-0 mb-4 text-5xl font-headline font-bold tracking-tighter text-fg">Models</h2>
          <p className="max-w-lg text-lg leading-relaxed text-muted">
            Manage the providers and models published in the generated <code className="text-fg">models.toml</code>.
          </p>
        </div>
        <div className="flex gap-4">
          <ValueBox label="Providers" variant="neon">
            {providers.length}
          </ValueBox>
          <ValueBox label="Models">{models.length}</ValueBox>
          <ValueBox label="Enabled">{enabledCount}</ValueBox>
        </div>
      </header>

      {providersQuery.error && <p className="mb-6 text-sm text-red-400">{providersQuery.error.message}</p>}
      {modelsQuery.error && <p className="mb-6 text-sm text-red-400">{modelsQuery.error.message}</p>}

      <section className="mb-8 rounded-2xl bg-surface p-6 shadow-2xl">
        <h3 className="mb-4 font-headline font-bold text-fg">Add Provider</h3>
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
          <Button type="submit" className="sm:col-span-3 justify-self-start" loading={createProvider.isPending}>
            Add Provider
          </Button>
        </form>
      </section>

      <section className="mb-8 overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="px-6 pb-6 pt-6">
          <Table columns={providerColumns} data={providers} showFilters={false} />
        </div>
      </section>

      <section className="mb-8 rounded-2xl bg-surface p-6 shadow-2xl">
        <h3 className="mb-4 font-headline font-bold text-fg">Add Model</h3>
        {providers.length === 0 ? (
          <p className="text-sm text-muted">Add a provider first.</p>
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
            <modelForm.AppField name="modelId">
              {field => <field.TextField label="Model ID" placeholder="accounts/fireworks/models/minimax-m3" />}
            </modelForm.AppField>
            <modelForm.AppField name="tasks">
              {field => (
                <div className="md:flex sm:col-span-3">
                  <span className="flex w-48 align-middle items-center justify-between">Tasks:</span>
                  <CheckboxGroup
                    value={field.state.value}
                    onValueChange={value => field.handleChange(value)}
                    className="flex flex-wrap gap-x-4 gap-y-2"
                  >
                    {MODEL_TASKS.map(task => (
                      <Field.Root key={task} name={task} className="flex items-center gap-2 text-sm text-fg">
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
            <Button type="submit" className="sm:col-span-3 justify-self-start" loading={createModel.isPending}>
              Add Model
            </Button>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="px-6 pb-6 pt-6">
          <Table columns={modelColumns} data={models} showFilters={false} />
        </div>
      </section>
    </>
  )
}
