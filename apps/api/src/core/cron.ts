import { marketplaceService, sandboxService } from "../services"
import { reportError } from "./report"

/** An anonymous sandbox offline this long is gone for good (one restarted without a volume comes back as a new row). */
const ANONYMOUS_SANDBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** How long sandboxes' load samples are kept for their charts. */
const SANDBOX_SAMPLE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class CronService {
  #jobs: Bun.CronJob[] = []
  #isRunning = false

  start() {
    if (this.#isRunning) {
      console.warn("cron service already running")
      return
    }

    this.#isRunning = true

    // Hourly marketplace sync; cheap when the branch hasn't moved (one GitHub call, no download).
    this.#jobs.push(
      Bun.cron("0 * * * *", async () => {
        // sync() reports and records its own failure before rethrowing
        await marketplaceService.sync().catch(() => {})
      }),
      Bun.cron("30 * * * *", async () => {
        await sandboxService
          .pruneAnonymous(ANONYMOUS_SANDBOX_TTL_MS)
          .catch(err => reportError("Couldn't prune anonymous sandboxes", err))
        await sandboxService
          .pruneSamples(SANDBOX_SAMPLE_TTL_MS)
          .catch(err => reportError("Couldn't prune sandbox load samples", err))
      })
    )
  }

  stop() {
    for (const job of this.#jobs) job.stop()
    this.#jobs = []
    this.#isRunning = false
  }
}
