import { debug, error, info, warn } from "@kaja/logger"
import type { Database } from "../../../core/db"
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
      warn("scheduler already running")
      return
    }

    this.#isRunning = true
    info("starting scheduler", { intervalMs })

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
    info("scheduler stopped")
  }

  async #runTasks() {
    try {
      debug("running scheduler tasks")

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
        info("marked nodes as inactive", { count: markedInactive, cancelledFor: becameInactiveIds.length })
      }

      // Mark commands as timeout if they've exceeded their timeout duration
      const timedOut = await this.#commandService.markTimeoutCommands()
      if (timedOut > 0) {
        info("marked commands as timeout", { count: timedOut })
      }
    } catch (err) {
      error("scheduler task failed", { error: err })
    }
  }
}
