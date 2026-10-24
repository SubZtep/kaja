import type { CatalogProvider, CatalogSyncResult, ListCatalogProvidersResponse, ModelTask } from "@kaja/schema/api"
import { catalogProviderSchema, catalogSyncResultSchema, catalogSyncStatusSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import type { CellContext, RowData } from "@tanstack/react-table"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../../components/form/primitives/Button"
import { Checkbox } from "../../../../components/form/primitives/Checkbox"
import { Badge } from "../../../../components/ui/Badge"
import { ErrorNotice } from "../../../../components/ui/ErrorNotice"
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
import { kindOptions } from "./-components/ProviderSettings"

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

const providerColumnHelper = tableColumnHelper<CatalogProvider>()

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
    <Link to="/admin/catalog/$providerId" params={{ providerId: provider.id }} className="group flex flex-col">
      <span className="text-fg group-hover:text-neon text-sm font-bold underline-offset-2 group-hover:underline">
        {provider.name}
      </span>
      <span className="text-muted font-mono text-xs">{provider.slug}</span>
    </Link>
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
  const navigate = useNavigate()

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

  const invalidateProviders = () => queryClient.invalidateQueries({ queryKey: ["catalog-providers"] })
  const onError = (err: Error) => toast.error(err.message || m.catalog_error_save_failed())

  const sync = useMutation({
    mutationFn: () => apiFetch("/admin/catalog/sync", {}).then(r => catalogSyncResultSchema.parse(r)),
    onSuccess: result => {
      invalidateProviders()
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
      // A new provider has no models yet, so its page is where the admin goes next.
      navigate({ to: "/admin/catalog/$providerId", params: { providerId: provider.id } })
    },
    onError
  })

  const toggleListed = useMutation({
    mutationFn: ({ id, listed }: { id: string; listed: boolean }) =>
      apiFetch(`/admin/catalog/providers/${id}`, { listed }, { method: "PATCH" }).then(r =>
        catalogProviderSchema.parse(r)
      ),
    onSuccess: invalidateProviders,
    onError
  })

  const providerForm = useAppForm({
    defaultValues: { slug: "", name: "", kind: "self-hosted" as string, baseUrl: "" },
    validators: { onSubmit: providerFormSchema },
    onSubmit: async ({ value }) => {
      await createProvider.mutateAsync({
        slug: value.slug.trim(),
        name: value.name.trim(),
        kind: value.kind as CatalogProvider["kind"],
        baseUrl: value.baseUrl.trim()
      })
    }
  })

  const providerColumns = providerColumnHelper.columns([
    providerColumnHelper.accessor("listed", {
      header: m.catalog_column_listed(),
      meta: { actions: { onToggle: args => toggleListed.mutate(args) } satisfies ListedMeta },
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
    })
  ])

  if (providersQuery.isLoading) return <Loader />

  const providers = providersQuery.data ?? []
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

      <Section className="mb-4" padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={providerColumns} data={providers} sorting={[]} />
        </div>
      </Section>

      <Section title={m.catalog_add_provider_title()}>
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
    </>
  )
}
