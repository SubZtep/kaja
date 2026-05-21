import { cancel, isCancel, log, spinner, text } from "@clack/prompts"
import type { CommandResult, PendingCommand } from "@kaja/schemas"
import { kaja } from "../lib/clients"
import { executeCommands } from "../lib/executor"
import { setConfig } from "../lib/kaja-sdk"

let heartbeatInterval: Timer | null = null
let currentPollInterval = 60000 // Default 60 seconds
const commandResults: CommandResult[] = []
let isExecutingCommands = false

/** Connect the CLI node with the API. */
export async function doStuff() {
  if (!kaja.config.id) {
    const name = await text({
      message: "What is your node's name?",
      placeholder: kaja.config.name,
      validate: value => {
        if (!value || value.length < 2) return "Name must be at least 2 characters"
        return undefined
      }
    })

    if (isCancel(name)) {
      cancel("No name provided")
      process.exit(1)
    }

    kaja.setConfig({ name })
  }

  const s = spinner()
  s.start("Connecting to server...")

  const nodeId = await kaja.connectNode()
  if (!nodeId) {
    s.stop("Failed to connect")
    process.exit(1)
  }

  // Save the node ID to config for future runs
  await setConfig({ ...kaja.config, id: nodeId })

  s.stop(`Connected! Node ID: ${nodeId}`)
  log.success("Node is now active and sending heartbeats")

  // Start heartbeat loop
  startHeartbeatLoop()
}

function startHeartbeatLoop() {
  // Send initial heartbeat immediately
  sendHeartbeat()

  // Then send heartbeat based on poll interval
  scheduleNextHeartbeat()
}

function scheduleNextHeartbeat() {
  if (heartbeatInterval) {
    clearTimeout(heartbeatInterval)
  }

  heartbeatInterval = setTimeout(() => {
    sendHeartbeat()
    scheduleNextHeartbeat()
  }, currentPollInterval)
}

async function sendHeartbeat() {
  if (!kaja.nodeId) {
    log.error("No node ID available for heartbeat")
    return
  }

  // Prepare heartbeat payload with any pending command results
  const payload = {
    nodeId: kaja.nodeId,
    status: (isExecutingCommands ? "busy" : "idle") as "idle" | "busy",
    commandResults: commandResults.length > 0 ? [...commandResults] : undefined
  }

  // Clear sent results after copying to payload
  commandResults.length = 0

  const response = await kaja.heartbeat(payload)

  if (!response) {
    log.warn("Heartbeat failed")
    return
  }

  // Update poll interval if server suggests a different one
  if (response.pollIntervalMs && response.pollIntervalMs !== currentPollInterval) {
    currentPollInterval = response.pollIntervalMs
    log.info(`Poll interval updated to ${currentPollInterval / 1000}s`)
  }

  // Execute any pending commands
  if (response.commands && response.commands.length > 0) {
    log.info(`Received ${response.commands.length} command(s)`)

    // Execute commands in the background
    void executeCommandsAsync(response.commands)
  }
}

async function executeCommandsAsync(commands: PendingCommand[]) {
  isExecutingCommands = true

  try {
    const results = await executeCommands(commands)

    // Add results to queue to be sent in next heartbeat
    commandResults.push(...results)

    for (const result of results) {
      if (result.status === "completed") {
        log.success(`Command ${result.commandId} completed`)
      } else {
        log.error(`Command ${result.commandId} ${result.status}: ${result.error}`)
      }
    }
  } catch (error) {
    log.error(`Error executing commands: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isExecutingCommands = false
  }
}

/** Stop heartbeat loop and cleanup */
export function cleanup() {
  if (heartbeatInterval) {
    clearTimeout(heartbeatInterval)
    heartbeatInterval = null
  }
}
