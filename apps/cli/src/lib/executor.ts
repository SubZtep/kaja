import type { CommandResult, PendingCommand } from "@kaja/schemas"
import { logger } from "./logger"

export interface ExecutedCommand extends CommandResult {
  commandId: string
}

/**
 * Execute a shell command with timeout
 */
export async function executeCommand(cmd: PendingCommand): Promise<ExecutedCommand> {
  const startTime = Date.now()

  try {
    logger.info({ commandId: cmd.commandId, command: cmd.command }, "executing command")

    const proc = Bun.spawn(["sh", "-c", cmd.command], {
      stdout: "pipe",
      stderr: "pipe"
    })

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill()
        reject(new Error(`Command timeout after ${cmd.timeoutSeconds}s`))
      }, cmd.timeoutSeconds * 1000)
    })

    // Race between command completion and timeout
    const result = await Promise.race([proc.exited, timeoutPromise])

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    const duration = Date.now() - startTime

    if (result !== 0) {
      logger.warn(
        {
          commandId: cmd.commandId,
          command: cmd.command,
          exitCode: result,
          duration,
          stderr
        },
        "command failed"
      )

      return {
        commandId: cmd.commandId,
        status: "failed",
        exitCode: result,
        result: stdout,
        error: stderr
      }
    }

    logger.info(
      {
        commandId: cmd.commandId,
        command: cmd.command,
        exitCode: result,
        duration
      },
      "command completed"
    )

    return {
      commandId: cmd.commandId,
      status: "completed",
      exitCode: result,
      result: stdout
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error(
      {
        error,
        commandId: cmd.commandId,
        command: cmd.command,
        duration
      },
      "command execution error"
    )

    // Check if it's a timeout
    if (errorMessage.includes("timeout")) {
      return {
        commandId: cmd.commandId,
        status: "timeout",
        error: errorMessage
      }
    }

    return {
      commandId: cmd.commandId,
      status: "failed",
      error: errorMessage
    }
  }
}

/**
 * Execute multiple commands in sequence
 */
export async function executeCommands(commands: PendingCommand[]): Promise<ExecutedCommand[]> {
  const results: ExecutedCommand[] = []

  for (const cmd of commands) {
    const result = await executeCommand(cmd)
    results.push(result)
  }

  return results
}
