import type { CreateWidgetKeyResponse, ListPersonasResponse, ListWidgetKeysResponse, WidgetKey } from "@kaja/schema/api"
import { widgetKeySchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../components/form/primitives/Button"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog"
import { Loader } from "../../components/ui/Loader"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { Table } from "../../components/ui/Table"
import { ValueBox } from "../../components/ui/ValueBox"
import { useApiFetch } from "../../lib/api-fetch"
import { useAppForm } from "../../lib/form"
import { userRequired } from "../../lib/loaders"
import { tableColumnHelper, type tableFeaturesConfig } from "../../lib/table"

export const Route = createFileRoute("/_admin/widget")({
  component: WidgetPage,
  loader: () => userRequired()
})

const createFormSchema = z.object({
  label: z.string().min(1, "Required"),
  allowedOrigins: z.string().min(1, "Required"),
  persona: z.string()
})

const AUTO_SELECT_PERSONA = ""

/** Comma or newline separated origins, e.g. "https://example.com, https://www.example.com". */
function parseOrigins(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map(o => o.trim())
    .filter(Boolean)
}

const columnHelper = tableColumnHelper<WidgetKey>()

function LabelCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, string>) {
  return <span className="font-bold text-fg">{info.getValue()}</span>
}

function KeyPrefixCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, string>) {
  return <span className="font-mono text-xs text-muted">{info.getValue()}…</span>
}

function OriginsCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, string[]>) {
  return <span className="font-mono text-xs text-muted">{info.getValue().join(", ")}</span>
}

function EnabledCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, boolean>) {
  return <span className={info.getValue() ? "text-neon" : "text-muted"}>{info.getValue() ? "Active" : "Revoked"}</span>
}

function CreatedAtCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function LastUsedAtCell(info: CellContext<typeof tableFeaturesConfig, WidgetKey, Date | null>) {
  const value = info.getValue()
  return <span className="font-mono text-xs text-muted">{value ? getTimeAgo(value) : "Never"}</span>
}

function makeActionsCell(onRevoke: (id: string) => void) {
  return function ActionsCell(info: { row: { original: WidgetKey } }) {
    if (!info.row.original.enabled) return null
    return (
      <div className="text-right">
        <ConfirmDialog
          title="Revoke widget key?"
          description={`Any site embedding "${info.row.original.label}" will stop working immediately.`}
          confirm="Revoke"
          onConfirm={() => onRevoke(info.row.original.id)}
        >
          <button type="button" className="inline-flex rounded-lg p-2 text-red-400 transition-all hover:bg-red-400/10">
            <Trash2 size={18} />
          </button>
        </ConfirmDialog>
      </div>
    )
  }
}

function EmbedSnippet({
  apiUrl,
  rawKey,
  persona
}: Readonly<{ apiUrl: string; rawKey: string; persona: string | null }>) {
  const mode = persona === "barkochba" ? ` data-kaja-mode="barkochba"` : ""
  const snippet = `<script async src="${apiUrl}/widget/widget.js" data-kaja-key="${rawKey}" data-kaja-base-url="${apiUrl}"${mode}></script>`
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <p className="mb-2 text-fg text-sm">
        Copy this key now — it won't be shown again. Paste the snippet below into your site's HTML.
      </p>
      <p className="mb-3 break-all font-mono text-neon text-sm">{rawKey}</p>
      <pre className="overflow-x-auto rounded-md bg-black/40 p-3 font-mono text-muted text-xs">{snippet}</pre>
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
    queryFn: () => apiFetch<ListWidgetKeysResponse>("/widget-keys").then(r => z.array(widgetKeySchema).parse(r.keys))
  })

  const { data: personas } = useQuery({
    queryKey: ["personas"],
    queryFn: () => apiFetch<ListPersonasResponse>("/admin/personas").then(r => r.personas)
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["widget-keys"] })

  const createKey = useMutation({
    mutationFn: (payload: { label: string; allowedOrigins: string[]; persona?: string }) =>
      apiFetch<CreateWidgetKeyResponse>("/widget-keys", payload),
    onSuccess: response => {
      invalidate()
      setJustCreated(response)
      toast.success("Widget key created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create widget key")
  })

  const revokeKey = useMutation({
    mutationFn: (id: string) => apiFetch(`/widget-keys/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidate()
      toast.success("Widget key revoked")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to revoke widget key")
  })

  const form = useAppForm({
    defaultValues: { label: "", allowedOrigins: "", persona: AUTO_SELECT_PERSONA },
    validators: { onSubmit: createFormSchema },
    onSubmit: async ({ value, formApi }) => {
      await createKey.mutateAsync({
        label: value.label,
        allowedOrigins: parseOrigins(value.allowedOrigins),
        persona: value.persona || undefined
      })
      formApi.reset()
    }
  })

  const columns = columnHelper.columns([
    columnHelper.accessor("label", { header: "Label", cell: LabelCell }),
    columnHelper.accessor("keyPrefix", { header: "Key", cell: KeyPrefixCell, enableColumnFilter: false }),
    columnHelper.accessor("allowedOrigins", {
      header: "Allowed Origins",
      cell: OriginsCell,
      enableColumnFilter: false
    }),
    columnHelper.accessor("enabled", { header: "Status", cell: EnabledCell, enableColumnFilter: false }),
    columnHelper.accessor("createdAt", { header: "Created", cell: CreatedAtCell, enableColumnFilter: false }),
    columnHelper.accessor("lastUsedAt", { header: "Last Used", cell: LastUsedAtCell, enableColumnFilter: false }),
    columnHelper.display({ id: "actions", header: "", cell: makeActionsCell(id => revokeKey.mutate(id)) })
  ])

  if (isLoading) return <Loader />

  const keys = data ?? []
  const activeCount = keys.filter(k => k.enabled).length

  return (
    <>
      <PageHeader
        title="Widget"
        description="Embed a Kaja chat widget on your own website. Anonymous visitors chat against your hosted account and model configuration."
        meta="widget"
      >
        <ValueBox label="Total" variant="neon">
          {keys.length}
        </ValueBox>
        <ValueBox label="Active">{activeCount}</ValueBox>
      </PageHeader>

      {error && <p className="mb-6 text-red-400 text-sm">{error.message}</p>}

      <Section className="mb-4">
        <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Create Widget Key</h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.AppField name="label">
            {field => <field.TextField label="Label" placeholder="Marketing site" />}
          </form.AppField>
          <form.AppField name="allowedOrigins">
            {field => (
              <field.TextField label="Allowed Origins" placeholder="https://example.com, https://www.example.com" />
            )}
          </form.AppField>
          <form.AppField name="persona">
            {field => (
              <field.SelectField
                label="Persona"
                options={[
                  { value: AUTO_SELECT_PERSONA, label: "Auto-select" },
                  ...(personas ?? []).map(p => ({ value: p.id, label: p.label }))
                ]}
              />
            )}
          </form.AppField>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createKey.isPending}>
            Create Key
          </Button>
        </form>
        {justCreated && <EmbedSnippet apiUrl={apiUrl} rawKey={justCreated.rawKey} persona={justCreated.persona} />}
      </Section>

      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={columns} data={keys} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
