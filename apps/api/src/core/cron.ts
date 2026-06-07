import { info, warn } from "@kaja/logger"

export class CronService {
  #jobs: Bun.CronJob[] = []
  #isRunning = false

  start() {
    if (this.#isRunning) {
      warn("cron service already running")
      return
    }

    this.#isRunning = true
    info("starting cron service")

    // Add cron jobs here as needed

    info("cron jobs scheduled", { jobCount: this.#jobs.length })
  }

  stop() {
    this.#jobs = []
    this.#isRunning = false
    info("cron service stopped")
  }
}
