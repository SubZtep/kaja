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
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { getPageTitle } from "../../../lib/vars"

export const Route = createFileRoute("/_admin/mcp-servers/")({
  component: McpServersPage,
  loader: () => userRequired("admin"),
  head: () => ({ meta: [{ title: getPageTitle("MCP Servers") }] })
})

const createFormSchema = z
  .object({
    serverId: z.string().min(1, "Required"),
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
        ctx.addIssue({ code: "custom", path: ["command"], message: "Required" })
      }
    } else if (!data.url.trim()) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Required" })
    } else {
      try {
        new URL(data.url.trim())
      } catch {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Must be a valid URL" })
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
  const label = server.url ? "headers" : "env"
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
          title="Delete MCP server?"
          description={`This will remove "${info.row.original.serverId}" from the generated mcp.toml.`}
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
      toast.success("MCP server created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create MCP server")
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/admin/mcp-servers/${id}`, { enabled }, { method: "PATCH" }).then(r => mcpServerSchema.parse(r)),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || "Failed to update MCP server")
  })

  const deleteMcpServer = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/mcp-servers/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidate()
      toast.success("MCP server deleted")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete MCP server")
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
      header: "Server ID",
      cell: ServerIdCell
    }),
    columnHelper.display({
      id: "connection",
      header: "Connection",
      cell: ConnectionCell
    }),
    columnHelper.display({
      id: "config",
      header: "Config",
      cell: ConfigCell
    }),
    columnHelper.accessor("enabled", {
      header: "Enabled",
      cell: makeEnabledCell(args => toggleEnabled.mutate(args)),
      enableColumnFilter: false
    }),
    columnHelper.accessor("createdAt", {
      header: "Created",
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
        title="MCP Servers"
        description={
          <>
            Manage the MCP servers published in the generated <code className="text-fg">mcp.toml</code>. Local servers
            spawn over stdio; online servers use Streamable HTTP.
          </>
        }
        meta="mcp.toml"
      >
        <ValueBox label="Total" variant="neon">
          {mcpServers.length}
        </ValueBox>
        <ValueBox label="Enabled">{enabledCount}</ValueBox>
      </PageHeader>

      {error && <p className="mb-6 text-red-400 text-sm">{error.message}</p>}

      <Section className="mb-4">
        <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Add MCP Server</h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.AppField name="serverId">
            {field => <field.TextField label="Server ID" placeholder="playwright" />}
          </form.AppField>
          <form.AppField name="transport">
            {field => (
              <field.SelectField
                label="Type"
                options={[
                  { value: "local", label: "Local (stdio)" },
                  { value: "http", label: "Online (HTTP)" }
                ]}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={state => state.values.transport}>
            {transport =>
              transport === "http" ? (
                <>
                  <form.AppField name="url">
                    {field => <field.TextField label="URL" placeholder="https://your-geo-service-host/mcp" />}
                  </form.AppField>
                  <form.AppField name="headers">
                    {field => (
                      <field.TextField label="Headers" placeholder="Authorization=Bearer your-secret-api-key" />
                    )}
                  </form.AppField>
                </>
              ) : (
                <>
                  <form.AppField name="command">
                    {field => <field.TextField label="Command" placeholder="bunx" />}
                  </form.AppField>
                  <form.AppField name="args">
                    {field => (
                      <field.TextField label="Args" placeholder="@playwright/mcp@latest --isolated --headless" />
                    )}
                  </form.AppField>
                  <form.AppField name="env">
                    {field => <field.TextField label="Env" placeholder="KEY=value, OTHER=value" />}
                  </form.AppField>
                </>
              )
            }
          </form.Subscribe>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createMcpServer.isPending}>
            Add Server
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
