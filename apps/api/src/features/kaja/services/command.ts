import type { CommandResult, CreateCommandRequest, PendingCommand, Command as SchemaCommand } from "@kaja/schemas"
import { and, desc, eq, sql } from "drizzle-orm"
import type { Database } from "../../../core/db"
import { logger } from "../../../core/logger"
import { command as commandTable, type Command as DbCommand } from "../../../db/schema"

export class CommandService {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  /**
   * Create a new command for a node
   */
  async createCommand(
    nodeId: string,
    request: CreateCommandRequest,
    createdBy?: string
  ): Promise<SchemaCommand | null> {
    try {
      const [result] = await this.#db
        .insert(commandTable)
        .values({
          nodeId: nodeId as any,
          command: request.command,
          args: (request.args ?? {}) as any,
          timeoutSeconds: request.timeoutSeconds ?? 300,
          createdBy: (createdBy ?? null) as any
        })
        .returning()

      if (!result) return null

      return this.#mapCommand(result)
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
      const result = await this.#db
        .select({
          id: commandTable.id,
          command: commandTable.command,
          args: commandTable.args,
          timeoutSeconds: commandTable.timeoutSeconds
        })
        .from(commandTable)
        .where(and(eq(commandTable.nodeId, nodeId as any), eq(commandTable.status, "pending")))
        .orderBy(commandTable.createdAt)

      return result.map(row => ({
        commandId: row.id,
        command: row.command,
        args: row.args as any,
        timeoutSeconds: row.timeoutSeconds ?? 300
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
      const result = await this.#db
        .update(commandTable)
        .set({
          status: "executing",
          startedAt: new Date()
        })
        .where(and(eq(commandTable.id, commandId as any), eq(commandTable.status, "pending")))
        .returning()

      return result.length > 0
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
      let resultJson: any = null
      if (commandResult.result !== undefined && commandResult.result !== null) {
        if (typeof commandResult.result === "string") {
          resultJson = { output: commandResult.result }
        } else {
          resultJson = commandResult.result
        }
      }

      const result = await this.#db
        .update(commandTable)
        .set({
          status: commandResult.status as any,
          completedAt: new Date(),
          result: resultJson,
          error: commandResult.error ?? null,
          exitCode: commandResult.exitCode ?? null
        })
        .where(eq(commandTable.id, commandId as any))
        .returning()

      return result.length > 0
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
      const result = await this.#db
        .update(commandTable)
        .set({
          status: "timeout",
          completedAt: new Date()
        })
        .where(
          and(
            eq(commandTable.status, "executing"),
            sql`${commandTable.startedAt} < NOW() - (${commandTable.timeoutSeconds} || ' seconds')::INTERVAL`
          )
        )
        .returning()

      return result.length
    } catch (error) {
      logger.error({ error }, "failed to mark timeout commands")
      return 0
    }
  }

  /**
   * Get all commands for a node
   */
  async getNodeCommands(nodeId: string, limit = 50): Promise<SchemaCommand[]> {
    try {
      const result = await this.#db
        .select()
        .from(commandTable)
        .where(eq(commandTable.nodeId, nodeId as any))
        .orderBy(desc(commandTable.createdAt))
        .limit(limit)

      return result.map(this.#mapCommand)
    } catch (error) {
      logger.error({ error, nodeId }, "failed to get node commands")
      return []
    }
  }

  /**
   * Get command by ID
   */
  async getCommand(commandId: string): Promise<SchemaCommand | null> {
    try {
      const result = await this.#db
        .select()
        .from(commandTable)
        .where(eq(commandTable.id, commandId as any))
        .limit(1)

      if (result.length === 0) return null

      return this.#mapCommand(result[0])
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
      const result = await this.#db
        .select({ id: commandTable.id })
        .from(commandTable)
        .where(and(eq(commandTable.nodeId, nodeId as any), eq(commandTable.status, "pending")))
        .limit(1)

      return result.length > 0
    } catch (error) {
      logger.error({ error, nodeId }, "failed to check pending commands")
      return false
    }
  }

  /**
   * Cancel all executing commands for inactive nodes
   * Called when a node goes inactive (crash, network drop, etc.)
   */
  async cancelExecutingCommandsForNode(nodeId: string): Promise<number> {
    try {
      const result = await this.#db
        .update(commandTable)
        .set({
          status: "failed",
          completedAt: new Date(),
          error: "Node became inactive while command was executing"
        })
        .where(and(eq(commandTable.nodeId, nodeId as any), eq(commandTable.status, "executing")))
        .returning()

      const count = result.length

      if (count > 0) {
        logger.info({ nodeId, count }, "cancelled executing commands for inactive node")
      }

      return count
    } catch (error) {
      logger.error({ error, nodeId }, "failed to cancel executing commands")
      return 0
    }
  }

  /**
   * Cancel all pending commands for a node
   * Useful when user wants to clear the queue
   */
  async cancelPendingCommandsForNode(nodeId: string): Promise<number> {
    try {
      const result = await this.#db
        .update(commandTable)
        .set({
          status: "failed",
          completedAt: new Date(),
          error: "Command cancelled"
        })
        .where(and(eq(commandTable.nodeId, nodeId as any), eq(commandTable.status, "pending")))
        .returning()

      return result.length
    } catch (error) {
      logger.error({ error, nodeId }, "failed to cancel pending commands")
      return 0
    }
  }

  #mapCommand(row: DbCommand): SchemaCommand {
    return {
      id: row.id,
      nodeId: row.nodeId,
      command: row.command,
      args: row.args as any,
      timeoutSeconds: row.timeoutSeconds ?? 300,
      status: row.status,
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? undefined,
      completedAt: row.completedAt ?? undefined,
      result: row.result as any,
      error: row.error ?? undefined,
      exitCode: row.exitCode ?? undefined,
      createdBy: row.createdBy ?? undefined
    }
  }
}
