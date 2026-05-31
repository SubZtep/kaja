import { error, info, warn } from "@kaja/logger"

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

    // Run geoipupdate at 20:46 on Thursdays and Saturdays
    const geoipUpdateJob = Bun.cron("46 20 * * 4,6", async () => {
      try {
        info("running geoipupdate cron job")
        const proc = Bun.spawn(["geoipupdate"], {
          stdout: "pipe",
          stderr: "pipe"
        })

        const exitCode = await proc.exited
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()

        if (exitCode === 0) {
          info("geoipupdate completed successfully", { stdout: stdout.trim() })
        } else {
          error("geoipupdate failed", { exitCode, stdout: stdout.trim(), stderr: stderr.trim() })
        }
      } catch (err) {
        error("geoipupdate cron job failed", { error: err })
      }
    })

    this.#jobs.push(geoipUpdateJob)
    info("cron jobs scheduled", { jobCount: this.#jobs.length })
  }

  stop() {
    this.#jobs = []
    this.#isRunning = false
    info("cron service stopped")
  }
}
