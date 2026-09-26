import type { AdminSandboxResponse, SandboxServerStats, SandboxStats } from "@kaja/schema/api"
import { adminSandboxResponseSchema } from "@kaja/schema/api"
import { cn, getTimeAgo } from "@kaja/shared"
import { useQuery } from "@tanstack/react-query"
import { ErrorNotice } from "../../../../../components/ui/ErrorNotice"
import { Loader } from "../../../../../components/ui/Loader"
import { Section } from "../../../../../components/ui/Section"
import { StatusDot } from "../../../../../components/ui/StatusDot"
import { ValueBox } from "../../../../../components/ui/ValueBox"
import { useApiFetch } from "../../../../../lib/api-fetch"
import { m } from "../../../../../paraglide/messages.js"

/** How often the page asks for fresh numbers; the query pauses while the tab is hidden. */
const REFRESH_MS = 3000

const UNITS = ["B", "KB", "MB", "GB", "TB"]

/** 512 MB, 1.4 GB: binary units, one decimal from a gigabyte up. */
function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit >= 3 ? 1 : 0)} ${UNITS[unit]}`
}

function StatLine({ label, value, warn }: Readonly<{ label: string; value: number; warn?: boolean }>) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className={cn("font-mono", warn && value > 0 ? "text-red-400" : "text-fg")}>{value}</span>
    </div>
  )
}

function ServerState({ server }: Readonly<{ server: SandboxServerStats }>) {
  if (server.state === "starting") return <StatusDot active={false} label={m.sandbox_state_starting()} />
  return server.pending > 0 ? (
    <StatusDot active label={m.sandbox_state_busy()} />
  ) : (
    <StatusDot active={false} label={m.sandbox_state_idle()} />
  )
}

function ServersTable({
  servers,
  emails
}: Readonly<{ servers: SandboxServerStats[]; emails: Record<string, string> }>) {
  if (servers.length === 0) return <p className="text-muted text-sm">{m.sandbox_no_servers()}</p>
  const head = "border-border border-b p-3 text-left font-mono text-muted text-xs uppercase tracking-wider"
  const cell = "border-border border-b p-3 text-sm"
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className={head}>{m.sandbox_column_user()}</th>
            <th className={head}>{m.sandbox_column_ability()}</th>
            <th className={head}>{m.sandbox_column_state()}</th>
            <th className={head}>{m.sandbox_column_memory()}</th>
            <th className={head}>{m.sandbox_column_calls()}</th>
            <th className={head}>{m.sandbox_column_sessions()}</th>
            <th className={head}>{m.sandbox_column_started()}</th>
            <th className={head}>{m.sandbox_column_last_used()}</th>
          </tr>
        </thead>
        <tbody>
          {servers.map(server => (
            <tr key={`${server.user}/${server.ability}`}>
              <td className={cn(cell, "text-fg")}>{emails[server.user] ?? server.user}</td>
              <td className={cn(cell, "font-mono")}>{server.ability}</td>
              <td className={cell}>
                <ServerState server={server} />
              </td>
              <td className={cn(cell, "font-mono text-muted")}>
                {server.rss === null ? "—" : formatBytes(server.rss)}
              </td>
              <td className={cn(cell, "font-mono text-muted")}>{server.pending}</td>
              <td className={cn(cell, "font-mono text-muted")}>{server.sessions}</td>
              <td className={cn(cell, "font-mono text-muted text-xs")}>{getTimeAgo(server.startedAt)}</td>
              <td className={cn(cell, "font-mono text-muted text-xs")}>{getTimeAgo(server.lastUsed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SandboxUp({ stats, emails }: Readonly<{ stats: SandboxStats; emails: Record<string, string> }>) {
  const { host, limits, pool, egress } = stats
  const busy = stats.servers.filter(server => server.pending > 0).length
  const memory = host.container
    ? { label: m.sandbox_container_memory(), used: host.container.current, total: host.container.max }
    : { label: m.sandbox_memory(), used: host.totalMemory - host.freeMemory, total: host.totalMemory }
  return (
    <>
      <p className="mb-4 text-muted text-sm">
        {m.sandbox_started({ time: getTimeAgo(stats.startedAt) })} ·{" "}
        {m.sandbox_runs({
          abilities: stats.abilities.join(", ") || "—",
          max: limits.maxProcesses,
          minutes: Math.round(limits.idleMs / 60_000)
        })}
      </p>
      <div className="mb-6 flex flex-wrap gap-3">
        <ValueBox label={m.sandbox_servers()} variant="neon">
          {stats.servers.length} / {limits.maxProcesses}
        </ValueBox>
        <ValueBox label={m.sandbox_busy()}>{busy}</ValueBox>
        <ValueBox label={memory.label}>
          {formatBytes(memory.used)}
          {memory.total !== null && <span className="text-muted text-sm"> / {formatBytes(memory.total)}</span>}
        </ValueBox>
        <ValueBox label={m.sandbox_load()}>
          {host.loadAvg[0]?.toFixed(2) ?? "—"}
          <span className="text-muted text-sm"> / {host.cpus}</span>
        </ValueBox>
      </div>
      <div className="mb-6">
        <ServersTable servers={stats.servers} emails={emails} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 mb-1 font-semibold text-fg text-sm">{m.sandbox_pool_title()}</h3>
          <StatLine label={m.sandbox_count_started()} value={pool.started} />
          <StatLine label={m.sandbox_count_stopped_idle()} value={pool.stoppedIdle} />
          <StatLine label={m.sandbox_count_made_room()} value={pool.madeRoom} />
          <StatLine label={m.sandbox_count_failed()} value={pool.failedToStart} warn />
          <StatLine label={m.sandbox_count_crashed()} value={pool.crashed} warn />
          <StatLine label={m.sandbox_count_refused_full()} value={pool.refusedFull} warn />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 mb-1 font-semibold text-fg text-sm">{m.sandbox_egress_title()}</h3>
          <StatLine label={m.sandbox_egress_open()} value={egress.open} />
          <StatLine label={m.sandbox_egress_allowed()} value={egress.allowed} />
          <StatLine label={m.sandbox_egress_refused()} value={egress.refused} />
          <StatLine label={m.sandbox_egress_failed()} value={egress.failed} />
        </div>
      </div>
      <p className="mt-6 mb-0 text-muted text-xs">
        {m.sandbox_own_process({ rss: formatBytes(stats.process.rss), heap: formatBytes(stats.process.heapUsed) })}
      </p>
    </>
  )
}

const STATUS_LABELS: Record<AdminSandboxResponse["status"], () => string> = {
  up: () => m.sandbox_status_up(),
  down: () => m.sandbox_status_down(),
  off: () => m.sandbox_status_off()
}

/** The MCP sandbox's servers, memory and counters, refreshed every few seconds. */
export function SandboxSection() {
  const apiFetch = useApiFetch()
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin", "sandbox"],
    queryFn: () => apiFetch<AdminSandboxResponse>("/admin/sandbox").then(r => adminSandboxResponseSchema.parse(r)),
    refetchInterval: REFRESH_MS
  })

  return (
    <Section
      className="mb-4"
      title={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{m.sandbox_title()}</span>
          <div className="flex items-center gap-4 font-normal">
            {data && <StatusDot active={data.status === "up"} label={STATUS_LABELS[data.status]()} />}
            <span className="font-mono text-muted text-xs">{m.sandbox_live({ seconds: REFRESH_MS / 1000 })}</span>
          </div>
        </div>
      }
    >
      <ErrorNotice error={error} />
      {isLoading && <Loader />}
      {data?.status === "off" && (
        <p className="text-muted text-sm">{m.sandbox_off_hint({ url: "SANDBOX_URL", secret: "SANDBOX_SECRET" })}</p>
      )}
      {data?.status === "down" && <p className="text-red-400 text-sm">{m.sandbox_down_hint({ error: data.error })}</p>}
      {data?.status === "up" && <SandboxUp stats={data.stats} emails={data.emails} />}
    </Section>
  )
}
