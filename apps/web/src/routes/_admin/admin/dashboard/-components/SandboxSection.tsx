import type {
  AdminSandboxEntry,
  AdminSandboxResponse,
  Sandbox,
  SandboxServerStats,
  SandboxStats
} from "@kaja/schema/api"
import { adminSandboxResponseSchema, type SandboxSample, sandboxSamplesResponseSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared/date"
import { cn } from "@kaja/shared/ui"
import { useQuery } from "@tanstack/react-query"
import { ErrorNotice } from "../../../../../components/ui/ErrorNotice"
import { Loader } from "../../../../../components/ui/Loader"
import { Section } from "../../../../../components/ui/Section"
import { StatusDot } from "../../../../../components/ui/StatusDot"
import { ValueBox } from "../../../../../components/ui/ValueBox"
import { useApiFetch } from "../../../../../lib/api-fetch"
import { formatBytes, hardware, place, runCommand } from "../../../../../lib/sandbox"
import { m } from "../../../../../paraglide/messages.js"

/** How often the page asks for fresh numbers; the query pauses while the tab is hidden. */
const REFRESH_MS = 3000

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

function owner(sandbox: Sandbox, emails: Record<string, string>): string {
  if (sandbox.kind === "official") return m.sandbox_kind_official()
  if (sandbox.kind === "anonymous") return m.sandbox_kind_anonymous()
  return m.sandbox_kind_owned({ email: (sandbox.ownerId && emails[sandbox.ownerId]) ?? sandbox.ownerId ?? "" })
}

/** How far back the load charts reach. */
const HISTORY_HOURS = 24

/** One measure over the last day, a bar per bucket; hovering a bar names its time and value. */
function HistoryBars({
  title,
  samples,
  value,
  format
}: Readonly<{
  title: string
  samples: SandboxSample[]
  value: (sample: SandboxSample) => number
  format: (value: number) => string
}>) {
  const max = Math.max(...samples.map(value), Number.EPSILON)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-muted">{title}</span>
        <span className="font-mono text-muted">{m.sandbox_history_peak({ value: format(max) })}</span>
      </div>
      <div className="flex h-16 items-end gap-px" role="img" aria-label={title}>
        {samples.map(sample => (
          <div
            key={sample.at.toISOString()}
            title={m.sandbox_history_tooltip({ time: sample.at.toLocaleString(), value: format(value(sample)) })}
            className={cn("min-w-px flex-1 rounded-t-sm", value(sample) > 0 ? "bg-neon" : "bg-border")}
            style={{ height: value(sample) > 0 ? `${Math.max(6, (value(sample) / max) * 100)}%` : "2px" }}
          />
        ))}
      </div>
    </div>
  )
}

/** A sandbox's servers and load over the last day, from its heartbeats. */
function SandboxHistory({ id }: Readonly<{ id: string }>) {
  const apiFetch = useApiFetch()
  const { data } = useQuery({
    queryKey: ["admin", "sandbox", id, "samples"],
    queryFn: () =>
      apiFetch(`/admin/sandbox/${id}/samples?hours=${HISTORY_HOURS}`).then(
        r => sandboxSamplesResponseSchema.parse(r).samples
      ),
    refetchInterval: 60_000
  })
  if (!data || data.length === 0) return null
  return (
    <div className="mt-6 flex flex-wrap gap-6">
      <HistoryBars
        title={m.sandbox_history_servers({ hours: HISTORY_HOURS })}
        samples={data}
        value={sample => sample.running}
        format={value => String(value)}
      />
      <HistoryBars
        title={m.sandbox_history_load({ hours: HISTORY_HOURS })}
        samples={data}
        value={sample => sample.load}
        format={value => value.toFixed(2)}
      />
    </div>
  )
}

function SandboxEntry({ entry, emails }: Readonly<{ entry: AdminSandboxEntry; emails: Record<string, string> }>) {
  const { sandbox, stats, error } = entry
  return (
    <div className="border-border border-b pb-6 last:border-b-0 last:pb-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold text-fg">{sandbox.name ?? m.sandbox_unnamed()}</span>
          <span className="text-muted text-sm">{owner(sandbox, emails)}</span>
          <span className="text-muted text-sm">{place(sandbox)}</span>
          {hardware(sandbox) && <span className="font-mono text-muted text-xs">{hardware(sandbox)}</span>}
        </div>
        <div className="flex items-center gap-3">
          {!sandbox.online && sandbox.lastSeenAt && (
            <span className="font-mono text-muted text-xs">
              {m.sandbox_last_seen({ time: getTimeAgo(sandbox.lastSeenAt) })}
            </span>
          )}
          <StatusDot active={sandbox.online} label={sandbox.online ? m.sandbox_online() : m.sandbox_offline()} />
        </div>
      </div>
      {error && <p className="text-red-400 text-sm">{m.sandbox_down_hint({ error })}</p>}
      {stats && <SandboxUp stats={stats} emails={emails} />}
      <SandboxHistory id={sandbox.id} />
    </div>
  )
}

/** Every registered MCP sandbox, and the online ones' servers, memory and counters, refreshed every few seconds. */
export function SandboxSection() {
  const apiFetch = useApiFetch()
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin", "sandbox"],
    queryFn: () => apiFetch<AdminSandboxResponse>("/admin/sandbox").then(r => adminSandboxResponseSchema.parse(r)),
    refetchInterval: REFRESH_MS
  })
  const online = data?.sandboxes.filter(entry => entry.sandbox.online).length ?? 0

  return (
    <Section
      className="mb-4"
      title={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{m.sandbox_title()}</span>
          <div className="flex items-center gap-4 font-normal">
            {data && (
              <StatusDot active={online > 0} label={m.sandbox_online_count({ online, total: data.sandboxes.length })} />
            )}
            <span className="font-mono text-muted text-xs">{m.sandbox_live({ seconds: REFRESH_MS / 1000 })}</span>
          </div>
        </div>
      }
    >
      <ErrorNotice error={error} />
      {isLoading && <Loader />}
      {data?.sandboxes.length === 0 && (
        <p className="text-muted text-sm">{m.sandbox_none({ command: runCommand() })}</p>
      )}
      {data && data.sandboxes.length > 0 && (
        <div className="flex flex-col gap-6">
          {data.sandboxes.map(entry => (
            <SandboxEntry key={entry.sandbox.id} entry={entry} emails={data.emails} />
          ))}
        </div>
      )}
    </Section>
  )
}
