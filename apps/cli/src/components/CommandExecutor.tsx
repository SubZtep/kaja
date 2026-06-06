import { exec } from "node:child_process"
import { promisify } from "node:util"
import { info, error as logError } from "@kaja/logger"
import type { Command } from "@kaja/schema"
import { EventSource } from "eventsource"
import { Box, Text } from "ink"
import { useEffect, useRef, useState } from "react"
import { sdk } from "../lib/sdk"

const execAsync = promisify(exec)

interface CommandExecutorProps {
  nodeId: string
}

export function CommandExecutor({ nodeId }: CommandExecutorProps) {
  const [commandQueue, setCommandQueue] = useState<Command[]>([])
  const [currentCommand, setCurrentCommand] = useState<Command | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const isExecuting = useRef(false)

  // Connect to command SSE stream
  useEffect(() => {
    let eventSource: EventSource | null = null

    async function connect() {
      const token = await sdk.getToken()
      if (!token || !nodeId) return

      info("connecting to command stream", { nodeId })

      const url = `${sdk.baseUrl}/nodes/${nodeId}/commands/stream`
      eventSource = new EventSource(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      eventSource.addEventListener("command-update", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === "created") {
            const command = data.command
            info("received command via SSE", { commandId: command.id, command: command.command })

            // Add to queue
            setCommandQueue(prev => [...prev, command])
          }
        } catch (err) {
          logError("failed to process command event", { error: err })
        }
      })

      eventSource.addEventListener("open", () => {
        info("command stream connected")
      })

      eventSource.addEventListener("error", err => {
        logError("command stream error", { error: err })
      })

      eventSourceRef.current = eventSource
    }

    connect()

    return () => {
      info("disconnecting from command stream")
      eventSource?.close()
    }
  }, [nodeId])

  // Process command queue
  useEffect(() => {
    if (isExecuting.current || commandQueue.length === 0 || currentCommand) return

    const nextCommand = commandQueue[0]
    setCurrentCommand(nextCommand)
    setCommandQueue(prev => prev.slice(1))
    executeCommand(nextCommand)
  }, [commandQueue, currentCommand])

  async function executeCommand(command: Command) {
    isExecuting.current = true
    info("starting command execution", { commandId: command.id, command: command.command })

    try {
      // Mark as started
      await sdk.nodes.commands.start(nodeId, command.id)

      // Execute the command with timeout
      const timeout = command.timeoutSeconds * 1000
      const { stdout, stderr } = await execAsync(command.command, {
        timeout,
        shell: "/bin/bash"
      })

      // Mark as completed
      const result = stdout || stderr
      await sdk.nodes.commands.complete(nodeId, command.id, result)

      info("command completed", { commandId: command.id, outputLength: result.length })
    } catch (err: any) {
      // Mark as failed
      const errorMessage = err.message || String(err)
      const exitCode = err.code || 1

      await sdk.nodes.commands.fail(nodeId, command.id, errorMessage, exitCode)

      logError("command execution failed", { commandId: command.id, error: errorMessage, exitCode })
    } finally {
      isExecuting.current = false
      setCurrentCommand(null)
    }
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {currentCommand && (
        <Text color="yellow">
          ⚡ Executing: <Text bold>{currentCommand.command}</Text>
        </Text>
      )}
      {commandQueue.length > 0 && (
        <Text color="gray">
          ({commandQueue.length} command{commandQueue.length > 1 ? "s" : ""} queued)
        </Text>
      )}
    </Box>
  )
}
