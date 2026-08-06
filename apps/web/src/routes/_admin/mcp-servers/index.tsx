import type { McpServer } from "@kaja/schema"
import { getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type CellContext, createColumnHelper } from "@tanstack/react-table"
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
import { useApiSdk } from "../../../hooks/use-api-sdk"
import { useAppForm } from "../../../lib/form"
import { userRequired } from "../../../lib/loaders"

export const Route = createFileRoute("/_admin/mcp-servers/")({
  component: McpServersPage,
  loader: () => userRequired("admin")
})

const createFormSchema = z.object({
  serverId: z.string().min(1, "Required"),
  command: z.string().min(1, "Required"),
  args: z.string(),
  env: z.string()
})

/** Space-separated args, tolerating quoted values with spaces. */
function parseArgs(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return matches.map(a => a.replace(/^["']|["']$/g, ""))
}

/** `KEY=value` pairs, one per line or comma-separated. */
function parseEnv(input: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of input.split(/[\n,]/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [key, ...rest] = trimmed.split("=")
    if (key && rest.length > 0) env[key.trim()] = rest.join("=").trim()
  }
  return env
}

const columnHelper = createColumnHelper<McpServer>()

function ServerIdCell(info: CellContext<McpServer, string>) {
  return <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
}

function CommandCell(info: CellContext<McpServer, string>) {
  const server = info.row.original
  return (
    <span className="font-mono text-xs text-muted">
      {info.getValue()} {server.args.join(" ")}
    </span>
  )
}

function EnvCell(info: CellContext<McpServer, Record<string, string>>) {
  const env = info.getValue()
  const keys = Object.keys(env)
  if (keys.length === 0) return <span className="text-xs text-muted">—</span>
  return <span className="font-mono text-xs text-muted">{keys.join(", ")}</span>
}

function makeEnabledCell(onToggle: (args: { id: string; enabled: boolean }) => void) {
  return function EnabledCell(info: CellContext<McpServer, boolean>) {
    const server = info.row.original
    return <Checkbox checked={info.getValue()} onCheckedChange={enabled => onToggle({ id: server.id, enabled })} />
  }
}

function CreatedAtCell(info: CellContext<McpServer, Date>) {
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
  const sdk = useApiSdk()
  const queryClient = useQueryClient()

  const { data, error, isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => sdk.mcpServers.list()
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mcp-servers"] })

  const createMcpServer = useMutation({
    mutationFn: (payload: { serverId: string; command: string; args: string[]; env: Record<string, string> }) =>
      sdk.mcpServers.create({ ...payload, enabled: true }),
    onSuccess: () => {
      invalidate()
      toast.success("MCP server created")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create MCP server")
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => sdk.mcpServers.update(id, { enabled }),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || "Failed to update MCP server")
  })

  const deleteMcpServer = useMutation({
    mutationFn: (id: string) => sdk.mcpServers.delete(id),
    onSuccess: () => {
      invalidate()
      toast.success("MCP server deleted")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete MCP server")
  })

  const form = useAppForm({
    defaultValues: {
      serverId: "",
      command: "",
      args: "",
      env: ""
    },
    validators: {
      onSubmit: createFormSchema
    },
    onSubmit: async ({ value, formApi }) => {
      await createMcpServer.mutateAsync({
        serverId: value.serverId,
        command: value.command,
        args: parseArgs(value.args),
        env: parseEnv(value.env)
      })
      formApi.reset()
    }
  })

  const columns = [
    columnHelper.accessor("serverId", {
      header: "Server ID",
      cell: ServerIdCell
    }),
    columnHelper.accessor("command", {
      header: "Command",
      cell: CommandCell
    }),
    columnHelper.accessor("env", {
      header: "Env",
      cell: EnvCell,
      enableColumnFilter: false
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
    {
      id: "actions",
      header: "",
      cell: makeActionsCell(id => deleteMcpServer.mutate(id))
    }
  ]

  if (isLoading) return <Loader />

  const mcpServers = data ?? []
  const enabledCount = mcpServers.filter(s => s.enabled).length

  return (
    <>
      <PageHeader
        title="MCP Servers"
        description={
          <>
            Manage the MCP servers published in the generated <code className="text-fg">mcp.toml</code>.
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
          <form.AppField name="command">
            {field => <field.TextField label="Command" placeholder="bunx" />}
          </form.AppField>
          <form.AppField name="args">
            {field => <field.TextField label="Args" placeholder="@playwright/mcp@latest --isolated --headless" />}
          </form.AppField>
          <form.AppField name="env">
            {field => <field.TextField label="Env" placeholder="KEY=value, OTHER=value" />}
          </form.AppField>
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
