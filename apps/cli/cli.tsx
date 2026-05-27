#!/usr/bin/env node
import { render } from "ink"
import { App } from "./components/App"
import { apiBaseUrl } from "./lib/clients"
import { deleteConfig } from "./lib/kaja-sdk"
import { logger } from "./lib/logger"
import { deleteAccessToken } from "./lib/token"
import { version } from "./package.json"

declare const CLI_VERSION: string

// Set API URL
process.env.API_URL = apiBaseUrl

// Handle helper commands before rendering
const command = process.argv[2]?.toLowerCase()

if (command === "help" || command === "--help" || command === "-h") {
  console.log(`Usage:  kaja <command>

Commands:
  version  Show version
  logout   Logout from Kaja
  help     Show help ♡
`)
  process.exit(0)
}

if (command === "version" || command === "--version" || command === "-v") {
  try {
    console.log(`v${CLI_VERSION}`)
  } catch {
    console.log(`v${version}`)
  }
  process.exit(0)
}

if (command === "logout") {
  deleteAccessToken()
    .then(() => {
      console.log("Logged out successfully")
      return deleteConfig()
    })
    .then(() => {
      console.log("Config deleted successfully")
      process.exit(0)
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[kaja] Logout failed: ${message}`)
      process.exit(1)
    })
}

// Render the Ink app
try {
  const { unmount, waitUntilExit } = render(<App />)

  // Handle cleanup on exit
  const cleanup = () => {
    unmount()
  }

  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  // Wait for the app to exit
  waitUntilExit().catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    logger.error({ error }, message)
    process.exit(1)
  })
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  logger.error({ error }, message)
  console.error(`Failed to start CLI: ${message}`)
  process.exit(1)
}
