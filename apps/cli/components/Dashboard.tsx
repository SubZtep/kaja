import type { CommandResult, PendingCommand } from "@kaja/schemas"
import { Box, Text, useInput } from "ink"
import { useEffect, useState } from "react"
import { kaja } from "../lib/clients"
import { executeCommands } from "../lib/executor"

interface DashboardProps {
  nodeId: string
  nodeName: string
  onQuit: () => void
}

interface CommandLogEntry {
  id: string
  command: string
  status: "completed" | "failed" | "timeout"
  timestamp: Date
  error?: string
}

export function Dashboard({ nodeId, nodeName, onQuit }: DashboardProps) {
  const [pollInterval, setPollInterval] = useState(60000)
  const [lastHeartbeat, setLastHeartbeat] = useState<Date>(new Date())
  const [status, setStatus] = useState<"idle" | "busy">("idle")
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([])
  const [commandResults, setCommandResults] = useState<CommandResult[]>([])

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onQuit()
    }
  })

  useEffect(() => {
    let heartbeatTimeout: Timer

    async function sendHeartbeat() {
      try {
        const payload = {
          nodeId,
          status,
          commandResults: commandResults.length > 0 ? [...commandResults] : undefined
        }

        // Clear sent results
        setCommandResults([])

        const response = await kaja.heartbeat(payload)

        if (response) {
          setLastHeartbeat(new Date())

          if (response.pollIntervalMs && response.pollIntervalMs !== pollInterval) {
            setPollInterval(response.pollIntervalMs)
          }

          if (response.commands && response.commands.length > 0) {
            // Execute commands in background
            executeCommandsAsync(response.commands)
          }
        }
      } catch (_error) {
        // Silently fail, will retry on next interval
      }

      // Schedule next heartbeat
      heartbeatTimeout = setTimeout(sendHeartbeat, pollInterval)
    }

    // Start heartbeat loop
    sendHeartbeat()

    return () => {
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout)
      }
    }
  }, [nodeId, status, pollInterval, commandResults])

  async function executeCommandsAsync(commands: PendingCommand[]) {
    setStatus("busy")

    try {
      const results = await executeCommands(commands)

      // Add to results queue for next heartbeat
      setCommandResults(prev => [...prev, ...results])

      // Add to command log
      const logEntries: CommandLogEntry[] = results.map(r => ({
        id: r.commandId,
        command: commands.find(c => c.commandId === r.commandId)?.command ?? "unknown",
        status: r.status,
        timestamp: new Date(),
        error: r.error
      }))

      setCommandLog(prev => [...prev, ...logEntries].slice(-50)) // Keep last 50
    } catch (_error) {
      // Log error
    } finally {
      setStatus("idle")
    }
  }

  const timeSinceHeartbeat = Math.floor((Date.now() - lastHeartbeat.getTime()) / 1000)

  return (
    <Box flexDirection="column" padding={1}>
      {/* Status Bar */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" padding={1}>
        <Box>
          <Text bold>Node: </Text>
          <Text>{nodeName}</Text>
          <Text dimColor> ({nodeId.slice(0, 13)}...)</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Status: </Text>
          <Text color={status === "idle" ? "green" : "yellow"}>{status === "idle" ? "● Idle" : "● Busy"}</Text>
          <Text dimColor> │ </Text>
          <Text>Poll: {pollInterval / 1000}s</Text>
          <Text dimColor> │ </Text>
          <Text dimColor>Last: {timeSinceHeartbeat}s ago</Text>
        </Box>
      </Box>

      {/* Command Log */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Command History:</Text>
        {commandLog.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor>No commands executed yet</Text>
          </Box>
        )}
        {commandLog.slice(-10).map(cmd => (
          <Box key={cmd.id} marginTop={1}>
            <Text>{cmd.status === "completed" ? "✓" : "✗"} </Text>
            <Text>{cmd.command}</Text>
            {cmd.error && <Text dimColor> ({cmd.error})</Text>}
          </Box>
        ))}
      </Box>

      {/* Help */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>Press q to quit</Text>
      </Box>
    </Box>
  )
}
