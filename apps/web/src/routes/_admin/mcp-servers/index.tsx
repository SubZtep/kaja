import type { CreateMcpServerRequest, ListMcpServersResponse, McpServer } from "@kaja/schema/api"
import { mcpServerSchema } from "@kaja/schema/api"
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
import { seo } from "../../../lib/seo"
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/mcp-servers/")({
  component: McpServersPage,
  loader: () => userRequired("admin"),
  head: () => ({ meta: seo({ title: m.nav_mcp_servers() }) })
})

const createFormSchema = z
  .object({
    serverId: z.string().min(1, m.mcp_servers_validation_required()),
    transport: z.enum(["local", "http"]),
    command: z.string(),
    args: z.string(),
    env: z.string(),
    url: z.string(),
    headers: z.string()
  })
  .superRefine((data, ctx) => {
    if (data.transport === "local") {
      if (!data.command.trim()) {
        ctx.addIssue({ code: "custom", path: ["command"], message: m.mcp_servers_validation_required() })
      }
    } else if (!data.url.trim()) {
      ctx.addIssue({ code: "custom", path: ["url"], message: m.mcp_servers_validation_required() })
    } else {
      try {
        new URL(data.url.trim())
      } catch {
        ctx.addIssue({ code: "custom", path: ["url"], message: m.mcp_servers_validation_invalid_url() })
      }
    }
  })

/** Space-separated args, tolerating quoted values with spaces. */
function parseArgs(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return matches.map(a => a.replace(/^["']|["']$/g, ""))
}

/** `KEY=value` pairs, one per line or comma-separated. */
function parseKeyValues(input: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of input.split(/[\n,]/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [key, ...rest] = trimmed.split("=")
    if (key && rest.length > 0) out[key.trim()] = rest.join("=").trim()
  }
  return out
}

const columnHelper = tableColumnHelper<McpServer>()

function ServerIdCell(info: CellContext<typeof tableFeaturesConfig, McpServer, string>) {
  return <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
}

function ConnectionCell(info: CellContext<typeof tableFeaturesConfig, McpServer, unknown>) {
  const server = info.row.original
  if (server.url) {
    return <span className="font-mono text-xs text-muted">{server.url}</span>
  }
  return (
    <span className="font-mono text-xs text-muted">
      {server.command} {server.args.join(" ")}
    </span>
  )
}

function ConfigCell(info: CellContext<typeof tableFeaturesConfig, McpServer, unknown>) {
  const server = info.row.original
  const keys = server.url ? Object.keys(server.headers) : Object.keys(server.env)
  if (keys.length === 0) return <span className="text-xs text-muted">—</span>
  const label = server.url ? m.mcp_servers_headers_label() : m.mcp_servers_env_label()
  return (
    <span className="font-mono text-xs text-muted">
      {label}: {keys.join(", ")}
    </span>
  )
}

function makeEnabledCell(onToggle: (args: { id: string; enabled: boolean }) => void) {
  return function EnabledCell(info: CellContext<typeof tableFeaturesConfig, McpServer, boolean>) {
    const server = info.row.original
    return <Checkbox checked={info.getValue()} onCheckedChange={enabled => onToggle({ id: server.id, enabled })} />
  }
}

function CreatedAtCell(info: CellContext<typeof tableFeaturesConfig, McpServer, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function makeActionsCell(onDelete: (id: string) => void) {
  return function ActionsCell(info: { row: { original: McpServer } }) {
    return (
      <div className="text-right">
        <ConfirmDialog
          title={m.mcp_servers_delete_confirm_title()}
          description={m.mcp_servers_delete_confirm_description({ serverId: info.row.original.serverId })}
          confirm={m.mcp_servers_delete_confirm_button()}
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

function McpServersPage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()

  const { data, error, isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () =>
      apiFetch<ListMcpServersResponse>("/admin/mcp-servers").then(r => z.array(mcpServerSchema).parse(r.mcpServers))
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] })

  const createMcpServer = useMutation({
    mutationFn: (payload: CreateMcpServerRequest) =>
      apiFetch("/admin/mcp-servers", payload).then(r => mcpServerSchema.parse(r)),
    onSuccess: () => {
      invalidate()
      toast.success(m.mcp_servers_success_created())
    },
    onError: (err: Error) => toast.error(err.message || m.mcp_servers_error_create_failed())
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/admin/mcp-servers/${id}`, { enabled }, { method: "PATCH" }).then(r => mcpServerSchema.parse(r)),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || m.mcp_servers_error_update_failed())
  })

  const deleteMcpServer = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/mcp-servers/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidate()
      toast.success(m.mcp_servers_success_deleted())
    },
    onError: (err: Error) => toast.error(err.message || m.mcp_servers_error_delete_failed())
  })

  const form = useAppForm({
    defaultValues: {
      serverId: "",
      transport: "local" as "local" | "http",
      command: "",
      args: "",
      env: "",
      url: "",
      headers: ""
    },
    validators: {
      onSubmit: createFormSchema
    },
    onSubmit: async ({ value, formApi }) => {
      if (value.transport === "http") {
        await createMcpServer.mutateAsync({
          serverId: value.serverId,
          url: value.url.trim(),
          headers: parseKeyValues(value.headers),
          args: [],
          env: {},
          enabled: true
        })
      } else {
        await createMcpServer.mutateAsync({
          serverId: value.serverId,
          command: value.command.trim(),
          args: parseArgs(value.args),
          env: parseKeyValues(value.env),
          headers: {},
          enabled: true
        })
      }
      formApi.reset()
    }
  })

  const columns = columnHelper.columns([
    columnHelper.accessor("serverId", {
      header: m.mcp_servers_column_server_id(),
      cell: ServerIdCell
    }),
    columnHelper.display({
      id: "connection",
      header: m.mcp_servers_column_connection(),
      cell: ConnectionCell
    }),
    columnHelper.display({
      id: "config",
      header: m.mcp_servers_column_config(),
      cell: ConfigCell
    }),
    columnHelper.accessor("enabled", {
      header: m.mcp_servers_column_enabled(),
      cell: makeEnabledCell(args => toggleEnabled.mutate(args)),
      enableColumnFilter: false
    }),
    columnHelper.accessor("createdAt", {
      header: m.mcp_servers_column_created(),
      cell: CreatedAtCell,
      enableColumnFilter: false
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: makeActionsCell(id => deleteMcpServer.mutate(id))
    })
  ])

  if (isLoading) return <Loader />

  const mcpServers = data ?? []
  const enabledCount = mcpServers.filter(s => s.enabled).length

  return (
    <>
      <PageHeader
        title={m.mcp_servers_title()}
        description={m.mcp_servers_description({ mcpToml: "mcp.toml" })}
        meta={m.mcp_servers_meta()}
      >
        <ValueBox label={m.mcp_servers_total()} variant="neon">
          {mcpServers.length}
        </ValueBox>
        <ValueBox label={m.mcp_servers_enabled()}>{enabledCount}</ValueBox>
      </PageHeader>

      {error && <p className="mb-6 text-red-400 text-sm">{error.message}</p>}

      <Section className="mb-4">
        <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">{m.mcp_servers_add_title()}</h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.AppField name="serverId">
            {field => <field.TextField label={m.mcp_servers_field_server_id()} placeholder="playwright" />}
          </form.AppField>
          <form.AppField name="transport">
            {field => (
              <field.SelectField
                label={m.mcp_servers_field_type()}
                options={[
                  { value: "local", label: m.mcp_servers_type_local() },
                  { value: "http", label: m.mcp_servers_type_http() }
                ]}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={state => state.values.transport}>
            {transport =>
              transport === "http" ? (
                <>
                  <form.AppField name="url">
                    {field => (
                      <field.TextField
                        label={m.mcp_servers_field_url()}
                        placeholder="https://your-geo-service-host/mcp"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="headers">
                    {field => (
                      <field.TextField
                        label={m.mcp_servers_field_headers()}
                        placeholder="Authorization=Bearer your-secret-api-key"
                      />
                    )}
                  </form.AppField>
                </>
              ) : (
                <>
                  <form.AppField name="command">
                    {field => <field.TextField label={m.mcp_servers_field_command()} placeholder="bunx" />}
                  </form.AppField>
                  <form.AppField name="args">
                    {field => (
                      <field.TextField
                        label={m.mcp_servers_field_args()}
                        placeholder="@playwright/mcp@latest --isolated --headless"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="env">
                    {field => (
                      <field.TextField label={m.mcp_servers_field_env()} placeholder="KEY=value, OTHER=value" />
                    )}
                  </form.AppField>
                </>
              )
            }
          </form.Subscribe>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createMcpServer.isPending}>
            {m.mcp_servers_add_button()}
          </Button>
        </form>
      </Section>

      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={columns} data={mcpServers} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
