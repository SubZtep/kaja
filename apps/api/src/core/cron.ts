import { marketplaceService } from "../services"

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
        await marketplaceService.sync().catch(() => {})
      })
    )
  }

  stop() {
    for (const job of this.#jobs) job.stop()
    this.#jobs = []
    this.#isRunning = false
  }
}
