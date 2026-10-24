import type { Describer } from "@kaja/nasi"
import { catalogService, imageService, marketplaceService, sandboxService } from "../services"
import { reportError } from "./report"

/** An anonymous sandbox offline this long is gone for good (one restarted without a volume comes back as a new row). */
const ANONYMOUS_SANDBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** How long sandboxes' load samples are kept for their charts. */
const SANDBOX_SAMPLE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class CronService {
  #jobs: Bun.CronJob[] = []
  #isRunning = false
  readonly #describer: () => Promise<Describer | undefined>

  /** `describer` finds the vision model the hourly sweep describes images with (none: the sweep skips). */
  constructor(opts: { describer: () => Promise<Describer | undefined> }) {
    this.#describer = opts.describer
  }

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
      // Images still without a description (a turn's describer failed or there was none then)
      Bun.cron("15 * * * *", async () => {
        const describer = await this.#describer().catch((err: unknown) => {
          reportError("Couldn't find the vision model for the image sweep", err)
          return undefined
        })
        if (describer)
          await imageService.sweep(describer).catch(err => reportError("The image description sweep failed", err))
      }),
      // Daily provider catalog from models.dev; a 304 when it hasn't changed.
      Bun.cron("45 3 * * *", async () => {
        // sync() reports and records its own failure before rethrowing
        await catalogService.sync().catch(() => {})
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
