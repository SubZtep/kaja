import type { Database } from "../../../core/db"
import { logger } from "../../../core/logger"
import { CommandService } from "./command"
import { NodeService } from "./node"

export class SchedulerService {
  readonly #nodeService: NodeService
  readonly #commandService: CommandService
  #intervalId?: Timer
  #isRunning = false

  constructor(db: Database) {
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

      // Get all active nodes before marking them inactive
      const activeNodes = await this.#nodeService.getAllActiveNodes()
      const activeNodeIds = new Set(activeNodes.map(n => n.id))

      // Mark inactive nodes (no heartbeat for 5 minutes)
      const markedInactive = await this.#nodeService.markInactiveNodes(300)

      // Get currently active nodes after marking inactive
      const stillActive = await this.#nodeService.getAllActiveNodes()
      const stillActiveIds = new Set(stillActive.map(n => n.id))

      // Find nodes that became inactive
      const becameInactiveIds = Array.from(activeNodeIds).filter(id => !stillActiveIds.has(id))

      // Cancel executing commands for nodes that became inactive
      for (const nodeId of becameInactiveIds) {
        await this.#commandService.cancelExecutingCommandsForNode(nodeId)
      }

      if (markedInactive > 0) {
        logger.info({ count: markedInactive, cancelledFor: becameInactiveIds.length }, "marked nodes as inactive")
      }

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
