import { createJobRunner } from "@kaja/modules"
import { createGuardedFetch } from "@kaja/nasi"
import { sql } from "../../core/db"
import { reportError } from "../../core/report"
import { moduleService } from "../../services"
import { moduleJobContext } from "./chat"

/** An account with no conversation for this long is quiet: its modules' jobs wait until it talks again. */
export const QUIET_AFTER_MS = 14 * 24 * 60 * 60 * 1000

/** Of these accounts, the ones with no conversation in the last {@link QUIET_AFTER_MS}. */
export async function quietUsers(userIds: string[], now: Date = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - QUIET_AFTER_MS)
  const active = await sql<{ user_id: string }[]>`
    SELECT DISTINCT user_id::text FROM nasi_session
    WHERE user_id::text = ANY(${userIds}::text[]) AND updated_at >= ${since}`
  const talking = new Set(active.map(row => row.user_id))
  return userIds.filter(id => !talking.has(id))
}

/**
 * Runs the enabled modules' background jobs (`CronService` ticks it every minute). A user's job gets what a turn would
 * (their sandboxes, the summarize model, their language); a global job's requests are the one thing modules send from
 * this host, to the public hosts the job names and nowhere else.
 */
export const moduleJobRunner = createJobRunner({
  sql,
  modules: () => moduleService.enabled(),
  userContext: moduleJobContext,
  globalSend: createGuardedFetch(),
  quiet: quietUsers,
  report: reportError
})
