import type { Command, CommandResult, CreateCommandRequest, PendingCommand } from "@kaja/schemas"
import type { Pool } from "pg"
import { logger } from "#/core/logger"

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
    } catch (error) {
      logger.error({ error, nodeId, command: request.command }, "failed to create command")
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
    } catch (error) {
      logger.error({ error, nodeId }, "failed to get pending commands")
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
    } catch (error) {
      logger.error({ error, commandId }, "failed to mark command as executing")
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
      let resultJson = null
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
    } catch (error) {
      logger.error({ error, commandId }, "failed to update command result")
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
    } catch (error) {
      logger.error({ error }, "failed to mark timeout commands")
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
    } catch (error) {
      logger.error({ error, nodeId }, "failed to get node commands")
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
    } catch (error) {
      logger.error({ error, commandId }, "failed to get command")
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
    } catch (error) {
      logger.error({ error, nodeId }, "failed to check pending commands")
      return false
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
