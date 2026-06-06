#!/usr/bin/env bun
import { KajaAPI } from "@kaja/sdk"
import { EventSource } from "eventsource"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

// Test token - you'll need to replace this with a valid session token
const TEST_TOKEN = process.env.TEST_TOKEN || ""
const API_URL = process.env.API_URL || "http://localhost:3001"

if (!TEST_TOKEN) {
  console.error("❌ Please set TEST_TOKEN environment variable")
  console.error("   Get it from your browser's session cookie or database")
  process.exit(1)
}

const sdk = new KajaAPI({
  baseUrl: API_URL,
  getAccessToken: async () => TEST_TOKEN
})

async function main() {
  console.log("🚀 Starting command execution test...")

  // Connect as a node
  console.log("📡 Connecting node...")
  const node = await sdk.nodes.connect({ name: "test-command-execution" })
  console.log(`✅ Connected as node: ${node.id}`)

  // Open SSE stream for commands
  console.log("🔌 Opening command stream...")
  const url = `${API_URL}/nodes/${node.id}/commands/stream`
  const eventSource = new EventSource(url, {
    headers: {
      Authorization: `Bearer ${TEST_TOKEN}`
    }
  })

  eventSource.on("open", () => {
    console.log("✅ Command stream connected")
  })

  eventSource.on("error", (err: any) => {
    console.error("❌ Stream error:", err)
  })

  eventSource.addEventListener("command-update", async (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === "created") {
        const command = data.command
        console.log(`\n⚡ Received command: ${command.command}`)

        // Start execution
        await sdk.nodes.commands.start(node.id, command.id)
        console.log("🏁 Started execution")

        try {
          // Execute the command
          const { stdout, stderr } = await execAsync(command.command, {
            timeout: command.timeoutSeconds * 1000,
            shell: "/bin/bash"
          })

          const result = stdout || stderr
          await sdk.nodes.commands.complete(node.id, command.id, result)
          console.log(`✅ Completed: ${result.substring(0, 100)}`)
        } catch (err: any) {
          const errorMessage = err.message || String(err)
          await sdk.nodes.commands.fail(node.id, command.id, errorMessage, err.code || 1)
          console.error(`❌ Failed: ${errorMessage}`)
        }
      }
    } catch (err) {
      console.error("❌ Failed to process command event:", err)
    }
  })

  // Send heartbeats
  setInterval(async () => {
    try {
      await sdk.nodes.heartbeat({ nodeId: node.id, status: "idle" })
      console.log("💓 Heartbeat sent")
    } catch (err) {
      console.error("❌ Heartbeat failed:", err)
    }
  }, 5000)

  console.log("\n✅ Node is ready to receive commands!")
  console.log(`   Node ID: ${node.id}`)
  console.log(`   Send a command from the web UI at http://localhost:3000/nodes`)
  console.log("\n   Press Ctrl+C to stop\n")

  // Handle cleanup
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down...")
    eventSource.close()
    await sdk.nodes.disconnect({ nodeId: node.id })
    console.log("✅ Disconnected")
    process.exit(0)
  })
}

main().catch(err => {
  console.error("❌ Fatal error:", err)
  process.exit(1)
})
