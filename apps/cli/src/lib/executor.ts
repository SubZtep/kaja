import { error, info, warn } from "@kaja/logger"
import type { CommandResult, PendingCommand } from "@kaja/schema"

export interface ExecutedCommand extends CommandResult {
  commandId: string
}

/**
 * Execute a shell command with timeout
 */
export async function executeCommand(cmd: PendingCommand): Promise<ExecutedCommand> {
  const startTime = Date.now()

  try {
    info("executing command", { commandId: cmd.commandId, command: cmd.command })

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
      warn("command failed", {
        commandId: cmd.commandId,
        command: cmd.command,
        exitCode: result,
        duration,
        stderr
      })

      return {
        commandId: cmd.commandId,
        status: "failed",
        exitCode: result,
        result: stdout,
        error: stderr
      }
    }

    info("command completed", {
      commandId: cmd.commandId,
      command: cmd.command,
      exitCode: result,
      duration
    })

    return {
      commandId: cmd.commandId,
      status: "completed",
      exitCode: result,
      result: stdout
    }
  } catch (err) {
    const duration = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)

    error("command execution error", {
      error: err,
      commandId: cmd.commandId,
      command: cmd.command,
      duration
    })

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
