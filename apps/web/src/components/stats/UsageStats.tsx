import type { StatsChannel, UsageStatsResponse } from "@kaja/schema/api"
import { usageStatsResponseSchema } from "@kaja/schema/api"
import { cn } from "@kaja/shared"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { ValueBox } from "../ui/ValueBox"

const RANGES = [7, 30, 90] as const

const compact = new Intl.NumberFormat(undefined, { notation: "compact" })

/** 420 ms, or 1.3 s from a second up. */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

function toolNote(tool: UsageStatsResponse["tools"][number]): string | undefined {
  const parts = [
    tool.approved + tool.declined > 0
      ? m.stats_tool_approvals({ approved: tool.approved, declined: tool.declined })
      : "",
    tool.errors > 0 ? m.stats_tool_errors({ errors: tool.errors }) : "",
    tool.avgDurationMs !== null ? m.stats_tool_duration({ duration: formatDuration(tool.avgDurationMs) }) : ""
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : undefined
}

const CHANNEL_LABELS: Record<StatsChannel, () => string> = {
  web: () => m.stats_channel_web(),
  telegram: () => m.stats_channel_telegram(),
  widget: () => m.stats_channel_widget()
}

/** The signed-in user's own activity numbers for the last `days` days, cut into the viewer's own calendar days. */
function useUsageStats(days: number) {
  const apiFetch = useApiFetch()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return useQuery({
    queryKey: ["stats", days, tz],
    queryFn: () =>
      apiFetch<UsageStatsResponse>(`/stats?days=${days}&tz=${encodeURIComponent(tz)}`).then(r =>
        usageStatsResponseSchema.parse(r)
      ),
    placeholderData: keepPreviousData
  })
}

/** One bar per day, scaled to the busiest day; the tooltip has the exact numbers. */
function PerDayChart({ perDay }: Readonly<{ perDay: UsageStatsResponse["perDay"] }>) {
  const max = Math.max(1, ...perDay.map(day => day.started))
  return (
    <div className="flex h-24 items-end gap-px" role="img" aria-label={m.stats_per_day_title()}>
      {perDay.map(day => (
        <div
          key={day.date}
          title={m.stats_day_tooltip({ date: day.date, started: day.started, active: day.active })}
          className={cn("min-w-px flex-1 rounded-t-sm", day.started > 0 ? "bg-neon" : "bg-border")}
          style={{ height: day.started > 0 ? `${Math.max(6, (day.started / max) * 100)}%` : "2px" }}
        />
      ))}
    </div>
  )
}

/** A ranked list with a bar behind each row, scaled to the biggest value. */
function BarList({
  title,
  rows,
  empty
}: Readonly<{
  title: string
  rows: { key: string; label: string; value: number; note?: string }[]
  empty?: string
}>) {
  const max = Math.max(1, ...rows.map(row => row.value))
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <p className="m-0 text-muted text-sm">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {rows.map(row => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-mono text-fg">{row.label}</span>
                <span className="shrink-0 font-mono text-muted">{row.value}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-border/60">
                <div className="h-full rounded-full bg-neon/80" style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
              {row.note && <p className="m-0 mt-0.5 text-[12px] text-muted">{row.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Dashboard section: when the user talked, what it cost in tokens and time, how the tools did, and which channels, personas and models replied. */
export function UsageStats() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const stats = useUsageStats(days)
  const data = stats.data

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 font-semibold text-fg text-lg">{m.stats_title()}</h2>
        <div className="flex gap-2">
          {RANGES.map(range => (
            <Button
              key={range}
              size="sm"
              variant={range === days ? "primary" : "secondary"}
              aria-pressed={range === days}
              onClick={() => setDays(range)}
            >
              {m.stats_range_days({ days: range })}
            </Button>
          ))}
        </div>
      </div>

      {stats.isError && <p className="m-0 text-red-400 text-sm">{m.stats_error()}</p>}
      {!data && !stats.isError && <Loader slim />}
      {data &&
        (data.totals.sessions === 0 ? (
          <p className="m-0 text-muted text-sm">{m.stats_empty()}</p>
        ) : (
          <div className={cn("flex flex-col gap-4", stats.isPlaceholderData && "opacity-60")}>
            <div className="flex flex-wrap gap-3">
              <ValueBox label={m.stats_sessions()} variant="neon">
                {data.totals.sessions}
              </ValueBox>
              <ValueBox label={m.stats_messages()}>{data.totals.messages}</ValueBox>
              <ValueBox label={m.stats_tool_calls()}>{data.totals.toolCalls}</ValueBox>
              {data.totals.promptTokens + data.totals.completionTokens > 0 && (
                <ValueBox label={m.stats_tokens()}>
                  <span
                    title={m.stats_tokens_detail({
                      prompt: data.totals.promptTokens.toLocaleString(),
                      completion: data.totals.completionTokens.toLocaleString()
                    })}
                  >
                    {compact.format(data.totals.promptTokens + data.totals.completionTokens)}
                  </span>
                </ValueBox>
              )}
              {data.totals.avgLatencyMs !== null && (
                <ValueBox label={m.stats_latency()}>{formatDuration(data.totals.avgLatencyMs)}</ValueBox>
              )}
            </div>

            <Section title={m.stats_per_day_title()}>
              <PerDayChart perDay={data.perDay} />
              <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted">
                <span>{data.perDay[0]?.date}</span>
                <span>{data.perDay.at(-1)?.date}</span>
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BarList
                title={m.stats_tools_title()}
                empty={m.stats_tools_empty()}
                rows={data.tools.map(tool => ({
                  key: tool.name,
                  label: tool.name,
                  value: tool.calls,
                  note: toolNote(tool)
                }))}
              />
              <BarList
                title={m.stats_channels_title()}
                rows={data.channels.map(row => ({
                  key: row.channel,
                  label: CHANNEL_LABELS[row.channel](),
                  value: row.sessions
                }))}
              />
              <BarList
                title={m.stats_personas_title()}
                rows={data.personas.map(row => ({
                  key: row.persona,
                  label: row.persona,
                  value: row.replies,
                  note: m.stats_persona_note({ sessions: row.sessions })
                }))}
              />
              <BarList
                title={m.stats_models_title()}
                rows={data.models.map(row => ({
                  key: row.model,
                  label: row.model,
                  value: row.replies,
                  note: m.stats_model_note({
                    sessions: row.sessions,
                    tokens: compact.format(row.promptTokens + row.completionTokens)
                  })
                }))}
              />
            </div>
          </div>
        ))}
    </section>
  )
}
