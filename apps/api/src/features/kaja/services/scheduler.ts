import type { Pool } from "pg"
import { logger } from "#/core/logger"
import { NodeService } from "./node"

export class SchedulerService {
  readonly #nodeService: NodeService
  #intervalId?: Timer
  #isRunning = false

  constructor(db: Pool) {
    this.#nodeService = new NodeService(db)
  }

  start(intervalMs = 60000) {
    if (this.#isRunning) {
      logger.warn("scheduler already running")
      return
    }

    this.#isRunning = true
    logger.info({ intervalMs }, "starting scheduler")

    // Run immediately on start
    this.#runTasks()

    // Schedule periodic runs
    this.#intervalId = setInterval(() => {
      this.#runTasks()
    }, intervalMs)
  }

  stop() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId)
      this.#intervalId = undefined
    }
    this.#isRunning = false
    logger.info("scheduler stopped")
  }

  async #runTasks() {
    try {
      logger.debug("running scheduler tasks")

      // Mark inactive nodes (no heartbeat for 5 minutes)
      await this.#nodeService.markInactiveNodes(300)
    } catch (error) {
      logger.error({ error }, "scheduler task failed")
    }
  }
}
