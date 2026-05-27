import type { Pool } from "pg"
import { logger } from "#/core/logger"
import { CommandService } from "./command"
import { NodeService } from "./node"

export class SchedulerService {
  readonly #nodeService: NodeService
  readonly #commandService: CommandService
  #intervalId?: Timer
  #isRunning = false

  constructor(db: Pool) {
    this.#nodeService = new NodeService(db)
    this.#commandService = new CommandService(db)
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

      // Mark commands as timeout if they've exceeded their timeout duration
      const timedOut = await this.#commandService.markTimeoutCommands()
      if (timedOut > 0) {
        logger.info({ count: timedOut }, "marked commands as timeout")
      }
    } catch (error) {
      logger.error({ error }, "scheduler task failed")
    }
  }
}
