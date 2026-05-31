import { logger } from "./logger"

export class CronService {
  #jobs: Bun.CronJob[] = []
  #isRunning = false

  start() {
    if (this.#isRunning) {
      logger.warn("cron service already running")
      return
    }

    this.#isRunning = true
    logger.info("starting cron service")

    // Run geoipupdate at 20:46 on Thursdays and Saturdays
    const geoipUpdateJob = Bun.cron("46 20 * * 4,6", async () => {
      try {
        logger.info("running geoipupdate cron job")
        const proc = Bun.spawn(["geoipupdate"], {
          stdout: "pipe",
          stderr: "pipe"
        })

        const exitCode = await proc.exited
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()

        if (exitCode === 0) {
          logger.info({ stdout: stdout.trim() }, "geoipupdate completed successfully")
        } else {
          logger.error({ exitCode, stdout: stdout.trim(), stderr: stderr.trim() }, "geoipupdate failed")
        }
      } catch (error) {
        logger.error({ error }, "geoipupdate cron job failed")
      }
    })

    this.#jobs.push(geoipUpdateJob)
    logger.info({ jobCount: this.#jobs.length }, "cron jobs scheduled")
  }

  stop() {
    this.#jobs = []
    this.#isRunning = false
    logger.info("cron service stopped")
  }
}
