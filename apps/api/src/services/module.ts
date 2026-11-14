import { disabledModules, jobSummaries, type Module, modules, setModuleEnabled } from "@kaja/modules"
import type { AdminModule } from "@kaja/schema/api"
import type { SQL } from "bun"

/** Which modules are on for this server, and how their jobs are doing. */
export class ModuleService {
  readonly #db: SQL

  constructor(db: SQL) {
    this.#db = db
  }

  /** The modules an admin hasn't switched off: the only ones a turn or the job runner sees. */
  async enabled(): Promise<readonly Module[]> {
    const off = await disabledModules(this.#db)
    return off.size === 0 ? modules : modules.filter(module => !off.has(module.id))
  }

  /** Every module with its switch and its jobs, for the admin. */
  async list(): Promise<AdminModule[]> {
    const [off, summaries] = await Promise.all([disabledModules(this.#db), jobSummaries(this.#db)])
    return modules.map(module => ({
      id: module.id,
      enabled: !off.has(module.id),
      jobs: (module.jobs ?? []).map(job => {
        const summary = summaries.find(each => each.module === module.id && each.job === job.id)
        return {
          id: job.id,
          scope: job.scope,
          everyMinutes: job.everyMinutes,
          rows: summary?.rows ?? 0,
          failing: summary?.failing ?? 0,
          error: summary?.error ?? null,
          lastRunAt: summary?.lastRunAt ? new Date(summary.lastRunAt) : null,
          nextDueAt: summary?.nextDueAt ? new Date(summary.nextDueAt) : null
        }
      })
    }))
  }

  /** Switches a module on or off for everyone; false when there is no such module. */
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    if (!modules.some(module => module.id === id)) return false
    await setModuleEnabled(this.#db, id, enabled)
    return true
  }
}
