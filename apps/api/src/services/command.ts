import { error, info } from "@kaja/logger"
import type { Command, CommandResult, CreateCommandRequest, PendingCommand } from "@kaja/schema/api"
import type { Pool } from "pg"
import { emitCommandEvent } from "./events"

export class CommandService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /**
   * Create a new command for a node
   */
  async createCommand(nodeId: string, request: CreateCommandRequest, createdBy?: string): Promise<Command | null> {
    try {
      const result = await this.#db.query<Command>(
        `INSERT INTO command (node_id, command, args, timeout_seconds, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [nodeId, request.command, request.args ?? {}, request.timeoutSeconds ?? 300, createdBy ?? null]
      )

      if (result.rows.length === 0) return null

      return this.#mapCommand(result.rows[0])
    } catch (err) {
      error("failed to create command", { error: err, nodeId, command: request.command })
      return null
    }
  }

  /**
   * Get pending commands for a node
   */
  async getPendingCommands(nodeId: string): Promise<PendingCommand[]> {
    try {
      const result = await this.#db.query(
        `SELECT id, command, args, timeout_seconds
         FROM command
         WHERE node_id = $1 AND status = 'pending'
         ORDER BY created_at ASC`,
        [nodeId]
      )

      return result.rows.map(row => ({
        commandId: row.id,
        command: row.command,
        args: row.args,
        timeoutSeconds: row.timeout_seconds
      }))
    } catch (err) {
      error("failed to get pending commands", { error: err, nodeId })
      return []
    }
  }

  /**
   * Mark command as executing (picked up by CLI)
   */
  async markCommandExecuting(commandId: string): Promise<boolean> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'executing', started_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [commandId]
      )

      return result.rowCount !== null && result.rowCount > 0
    } catch (err) {
      error("failed to mark command as executing", { error: err, commandId })
      return false
    }
  }

  /**
   * Update command with result from CLI
   */
  async updateCommandResult(commandId: string, commandResult: CommandResult): Promise<boolean> {
    try {
      // Wrap result in JSON object if it's a string, otherwise pass as-is
      // PostgreSQL driver expects plain JS object, not stringified JSON
      let resultJson: any = null
      if (commandResult.result !== undefined && commandResult.result !== null) {
        if (typeof commandResult.result === "string") {
          resultJson = { output: commandResult.result }
        } else {
          resultJson = commandResult.result
        }
      }

      const result = await this.#db.query(
        `UPDATE command
         SET status = $2,
             completed_at = NOW(),
             result = $3::jsonb,
             error = $4,
             exit_code = $5
         WHERE id = $1`,
        [
          commandId,
          commandResult.status,
          resultJson ? JSON.stringify(resultJson) : null,
          commandResult.error ?? null,
          commandResult.exitCode ?? null
        ]
      )

      return result.rowCount !== null && result.rowCount > 0
    } catch (err) {
      error("failed to update command result", { error: err, commandId })
      return false
    }
  }

  /**
   * Mark commands as timeout if they've been executing too long
   */
  async markTimeoutCommands(): Promise<number> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'timeout', completed_at = NOW()
         WHERE status = 'executing'
           AND started_at < NOW() - (timeout_seconds || ' seconds')::INTERVAL`
      )

      return result.rowCount ?? 0
    } catch (err) {
      error("failed to mark timeout commands", { error: err })
      return 0
    }
  }

  /**
   * Get all commands for a node
   */
  async getNodeCommands(nodeId: string, limit = 50): Promise<Command[]> {
    try {
      const result = await this.#db.query<Command>(
        `SELECT * FROM command
         WHERE node_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [nodeId, limit]
      )

      return result.rows.map(this.#mapCommand)
    } catch (err) {
      error("failed to get node commands", { error: err, nodeId })
      return []
    }
  }

  /**
   * Get command by ID
   */
  async getCommand(commandId: string): Promise<Command | null> {
    try {
      const result = await this.#db.query<Command>(`SELECT * FROM command WHERE id = $1`, [commandId])

      if (result.rows.length === 0) return null

      return this.#mapCommand(result.rows[0])
    } catch (err) {
      error("failed to get command", { error: err, commandId })
      return null
    }
  }

  /**
   * Check if node has pending commands
   */
  async hasPendingCommands(nodeId: string): Promise<boolean> {
    try {
      const result = await this.#db.query(
        `SELECT 1 FROM command
         WHERE node_id = $1 AND status = 'pending'
         LIMIT 1`,
        [nodeId]
      )

      return result.rows.length > 0
    } catch (err) {
      error("failed to check pending commands", { error: err, nodeId })
      return false
    }
  }

  /**
   * Cancel all executing commands for inactive nodes
   * Called when a node goes inactive (crash, network drop, etc.)
   */
  async cancelExecutingCommandsForNode(nodeId: string): Promise<number> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'failed',
             completed_at = NOW(),
             error = 'Node became inactive while command was executing'
         WHERE node_id = $1
           AND status = 'executing'`,
        [nodeId]
      )

      if (result.rowCount && result.rowCount > 0) {
        info("cancelled executing commands for inactive node", { nodeId, count: result.rowCount })
      }

      return result.rowCount ?? 0
    } catch (err) {
      error("failed to cancel executing commands", { error: err, nodeId })
      return 0
    }
  }

  /**
   * Cancel all pending commands for a node
   * Useful when user wants to clear the queue
   */
  async cancelPendingCommandsForNode(nodeId: string): Promise<number> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'failed',
             completed_at = NOW(),
             error = 'Command cancelled'
         WHERE node_id = $1
           AND status = 'pending'`,
        [nodeId]
      )

      return result.rowCount ?? 0
    } catch (err) {
      error("failed to cancel pending commands", { error: err, nodeId })
      return 0
    }
  }

  /**
   * Start a command (mark as executing)
   */
  async startCommand(commandId: string): Promise<Command | null> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'executing', started_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [commandId]
      )

      if (result.rows.length === 0) return null

      const command = this.#mapCommand(result.rows[0])

      emitCommandEvent({
        type: "started",
        command,
        nodeId: command.nodeId
      })

      return command
    } catch (err) {
      error("failed to start command", { error: err, commandId })
      return null
    }
  }

  /**
   * Complete a command with result
   */
  async completeCommand(commandId: string, commandResult: unknown, exitCode?: number): Promise<Command | null> {
    try {
      // Wrap result in JSON object if it's a string, otherwise pass as-is
      let resultJson: any = null
      if (commandResult !== undefined && commandResult !== null) {
        if (typeof commandResult === "string") {
          resultJson = { output: commandResult }
        } else {
          resultJson = commandResult
        }
      }

      const result = await this.#db.query(
        `UPDATE command
         SET status = 'completed',
             completed_at = NOW(),
             result = $2::jsonb,
             exit_code = $3
         WHERE id = $1 AND status = 'executing'
         RETURNING *`,
        [commandId, resultJson ? JSON.stringify(resultJson) : null, exitCode ?? null]
      )

      if (result.rows.length === 0) return null

      const command = this.#mapCommand(result.rows[0])

      emitCommandEvent({
        type: "completed",
        command,
        nodeId: command.nodeId
      })

      return command
    } catch (err) {
      error("failed to complete command", { error: err, commandId })
      return null
    }
  }

  /**
   * Mark command as failed
   */
  async failCommand(commandId: string, errorMessage: string, exitCode?: number): Promise<Command | null> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'failed',
             completed_at = NOW(),
             error = $2,
             exit_code = $3
         WHERE id = $1 AND status = 'executing'
         RETURNING *`,
        [commandId, errorMessage, exitCode ?? null]
      )

      if (result.rows.length === 0) return null

      const command = this.#mapCommand(result.rows[0])

      emitCommandEvent({
        type: "failed",
        command,
        nodeId: command.nodeId
      })

      return command
    } catch (err) {
      error("failed to fail command", { error: err, commandId })
      return null
    }
  }

  /**
   * Cancel a pending or executing command
   */
  async cancelCommand(commandId: string): Promise<Command | null> {
    try {
      const result = await this.#db.query(
        `UPDATE command
         SET status = 'failed',
             completed_at = NOW(),
             error = 'Command cancelled by user'
         WHERE id = $1 AND status IN ('pending', 'executing')
         RETURNING *`,
        [commandId]
      )

      if (result.rows.length === 0) return null

      info("command cancelled", { commandId })
      return this.#mapCommand(result.rows[0])
    } catch (err) {
      error("failed to cancel command", { error: err, commandId })
      return null
    }
  }

  #mapCommand(row: any): Command {
    return {
      id: row.id,
      nodeId: row.node_id,
      command: row.command,
      args: row.args,
      timeoutSeconds: row.timeout_seconds,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result,
      error: row.error,
      exitCode: row.exit_code,
      createdBy: row.created_by
    }
  }
}
