import { type FetchLike, iso, type ModelCallUsage, pgText } from "@kaja/nasi"
import type { SQL } from "bun"
import type { JobResult, Module, ModuleContext, ModuleJob } from "../contract"

/** A failed run is tried again after these waits, then at the job's regular time. */
export const RETRY_MINUTES: readonly number[] = [5, 30, 120]
/** How long a quiet account's due jobs wait before the runner asks about the account again. */
export const QUIET_DEFER_MINUTES = 60
const RUN_TIMEOUT_MS = 5 * 60_000
const CONCURRENCY = 2
const MAX_ERROR_CHARS = 300

const minutesAfter = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000).toISOString()

/**
 * Makes a user's job due at `dueAt` (now, unless given), or sooner if its row was due later. This is how a user's job
 * starts: by the module noticing there is work for the account.
 */
export async function scheduleJob(
  ctx: Pick<ModuleContext, "sql" | "userId">,
  moduleId: string,
  jobId: string,
  dueAt: Date = new Date()
): Promise<void> {
  await ctx.sql.begin(
    tx => tx`
      INSERT INTO module_job (id, module, job, user_id, key, due_at)
      VALUES (${Bun.randomUUIDv7()}, ${moduleId}, ${jobId}, ${ctx.userId}, ${ctx.userId}, ${dueAt.toISOString()})
      ON CONFLICT (module, job, key) DO UPDATE
      SET due_at = CASE WHEN EXCLUDED.due_at < module_job.due_at THEN EXCLUDED.due_at ELSE module_job.due_at END`
  )
}

/** One job's rows in short, for an admin's view. */
export type JobSummary = {
  module: string
  job: string
  /** Rows: accounts for a user job, one for a global job. */
  rows: number
  /** Rows whose last run failed. */
  failing: number
  /** One failing row's message. */
  error?: string
  lastRunAt?: string
  nextDueAt?: string
}

/** Every job that has rows, by module and job. */
export async function jobSummaries(sql: SQL): Promise<JobSummary[]> {
  const rows = await sql<
    {
      module: string
      job: string
      rows: number | string
      failing: number | string
      error: string | null
      last_run_at: Date | string | null
      next_due_at: Date | string | null
    }[]
  >`
    SELECT module, job, COUNT(*) AS rows, COALESCE(SUM(CASE WHEN last_error IS NULL THEN 0 ELSE 1 END), 0) AS failing,
           MAX(last_error) AS error, MAX(last_run_at) AS last_run_at, MIN(due_at) AS next_due_at
    FROM module_job GROUP BY module, job ORDER BY module, job`
  return rows.map(row => ({
    module: row.module,
    job: row.job,
    rows: Number(row.rows),
    failing: Number(row.failing),
    error: row.error ?? undefined,
    lastRunAt: row.last_run_at === null ? undefined : iso(row.last_run_at),
    nextDueAt: row.next_due_at === null ? undefined : iso(row.next_due_at)
  }))
}

export type JobRunnerOptions = {
  sql: SQL
  /** The modules whose jobs may run now; a host leaves out the ones switched off. Asked every tick. */
  modules: () => Promise<readonly Module[]>
  /** One account's context for a user job, as a turn would build it. */
  userContext: (userId: string) => Promise<ModuleContext>
  /** Sends a global job's requests from this host; the runner limits it to the job's `hosts`. */
  globalSend: FetchLike
  /** Which of these accounts nobody uses now: their due jobs wait instead of running. */
  quiet?: (userIds: string[]) => Promise<string[]>
  /** Told about every failed run, and about a model call that couldn't be recorded. */
  report?: (message: string, error: unknown) => void
  now?: () => Date
  /** How long one run may take (tests shorten it). */
  timeoutMs?: number
}

type JobRow = { id: string; user_id: string | null; attempts: number; due_at: Date | string }
type Claimed = { row: JobRow; module: Module; job: ModuleJob }

// A global job's requests leave from the host, so they reach nothing but the hosts the job names.
function onlyHosts(send: FetchLike, hosts: string[]): FetchLike {
  return async (url, init) => {
    const { protocol, hostname } = new URL(String(url))
    if (protocol !== "https:" || !hosts.includes(hostname))
      throw new Error(`This job may only reach ${hosts.join(", ")} over https`)
    // A redirect could lead anywhere else.
    return send(url, { ...init, redirect: "error" })
  }
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("The run took too long")), { once: true })
  })
}

/**
 * Runs the modules' jobs from their `module_job` rows. The host calls `tick` every minute; it claims what is due (two
 * runs at a time across ticks) and resolves once the runs it started are over. One process only: a claim is a plain
 * update, and a row left started by a process that died is taken again after twice the run timeout.
 */
export function createJobRunner(opts: JobRunnerOptions) {
  const { sql } = opts
  const now = opts.now ?? (() => new Date())
  const timeoutMs = opts.timeoutMs ?? RUN_TIMEOUT_MS
  const seeded = new Set<string>()
  let claiming = false
  let running = 0

  // A global job's one row, made the first time this process sees the job.
  async function seed(module: Module, job: ModuleJob, at: Date): Promise<void> {
    const name = `${module.id}/${job.id}`
    if (job.scope !== "global" || seeded.has(name)) return
    await sql.begin(
      tx => tx`
        INSERT INTO module_job (id, module, job, user_id, key, due_at)
        VALUES (${Bun.randomUUIDv7()}, ${module.id}, ${job.id}, NULL, '', ${at.toISOString()})
        ON CONFLICT (module, job, key) DO NOTHING`
    )
    seeded.add(name)
  }

  async function deferQuiet(at: Date): Promise<void> {
    if (!opts.quiet) return
    const due = await sql<{ user_id: string }[]>`
      SELECT DISTINCT user_id FROM module_job WHERE user_id IS NOT NULL AND due_at <= ${at.toISOString()}`
    if (due.length === 0) return
    const later = minutesAfter(at, QUIET_DEFER_MINUTES)
    for (const userId of await opts.quiet(due.map(row => row.user_id)))
      await sql.begin(
        tx => tx`
          UPDATE module_job SET due_at = ${later} WHERE user_id = ${userId} AND due_at <= ${at.toISOString()}`
      )
  }

  async function claim(): Promise<Claimed[]> {
    const jobs = (await opts.modules()).flatMap(module => (module.jobs ?? []).map(job => ({ module, job })))
    if (jobs.length === 0) return []
    const at = now()
    for (const { module, job } of jobs) await seed(module, job, at)
    await deferQuiet(at)
    const free = CONCURRENCY - running
    if (free <= 0) return []
    const stale = new Date(at.getTime() - 2 * timeoutMs).toISOString()
    const due: Claimed[] = []
    for (const { module, job } of jobs) {
      const rows = await sql<JobRow[]>`
        SELECT id, user_id, attempts, due_at FROM module_job
        WHERE module = ${module.id} AND job = ${job.id} AND due_at <= ${at.toISOString()}
          AND (started_at IS NULL OR started_at < ${stale})
        ORDER BY due_at LIMIT ${free}`
      due.push(...rows.map(row => ({ row, module, job })))
    }
    const claimed = due.toSorted((a, b) => iso(a.row.due_at).localeCompare(iso(b.row.due_at))).slice(0, free)
    for (const { row } of claimed)
      await sql.begin(tx => tx`UPDATE module_job SET started_at = ${at.toISOString()} WHERE id = ${row.id}`)
    running += claimed.length
    return claimed
  }

  function recordModelCall(row: JobRow, module: Module, job: ModuleJob, usage: ModelCallUsage): Promise<unknown> {
    return sql
      .begin(
        tx => tx`
          INSERT INTO module_model_call (id, user_id, module, job, model, prompt_tokens, completion_tokens,
                                         latency_ms, created_at)
          VALUES (${Bun.randomUUIDv7()}, ${row.user_id}, ${module.id}, ${job.id}, ${pgText(usage.model)},
                  ${usage.promptTokens ?? null}, ${usage.completionTokens ?? null}, ${usage.latencyMs},
                  ${now().toISOString()})`
      )
      .catch((error: unknown) => opts.report?.(`Couldn't record a model call of ${module.id}/${job.id}`, error))
  }

  async function execute({ row, module, job }: Claimed, signal: AbortSignal): Promise<JobResult> {
    if (job.scope === "global") return job.run({ sql, signal, send: onlyHosts(opts.globalSend, job.hosts) })
    if (row.user_id === null) throw new Error("A user's job has a row without a user")
    const writes: Promise<unknown>[] = []
    try {
      return await job.run({
        ...(await opts.userContext(row.user_id)),
        signal,
        onModelCall: usage => writes.push(recordModelCall(row, module, job, usage))
      })
    } finally {
      await Promise.all(writes)
    }
  }

  async function run(claimed: Claimed): Promise<void> {
    const { row, module, job } = claimed
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const result = await Promise.race([execute(claimed, signal), aborted(signal)])
      const at = now()
      await sql.begin(tx =>
        result === "done"
          ? tx`DELETE FROM module_job WHERE id = ${row.id}`
          : tx`
              UPDATE module_job
              SET due_at = ${minutesAfter(at, job.everyMinutes)}, started_at = NULL, last_run_at = ${at.toISOString()},
                  last_error = NULL, attempts = 0
              WHERE id = ${row.id}`
      )
    } catch (error) {
      opts.report?.(`The ${module.id} module's ${job.id} job failed`, error)
      const at = now()
      const attempts = row.attempts + 1
      const retryIn = RETRY_MINUTES[attempts - 1]
      const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_CHARS)
      await sql
        .begin(
          tx => tx`
            UPDATE module_job
            SET due_at = ${minutesAfter(at, retryIn ?? job.everyMinutes)}, started_at = NULL,
                last_run_at = ${at.toISOString()}, last_error = ${pgText(message)},
                attempts = ${retryIn === undefined ? 0 : attempts}
            WHERE id = ${row.id}`
        )
        .catch((failure: unknown) => opts.report?.(`Couldn't note the ${module.id}/${job.id} job's failure`, failure))
    } finally {
      running--
    }
  }

  return {
    /** Claims the jobs due now and runs them; a tick that arrives while another is claiming does nothing. */
    async tick(): Promise<void> {
      if (claiming) return
      claiming = true
      let claimed: Claimed[]
      try {
        claimed = await claim()
      } finally {
        claiming = false
      }
      await Promise.all(claimed.map(run))
    }
  }
}

export type JobRunner = ReturnType<typeof createJobRunner>
