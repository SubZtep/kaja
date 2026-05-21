import { log, updateSettings } from "@clack/prompts"
import { apiBaseUrl } from "./lib/clients"
import { logger } from "./lib/logger"
import * as auth from "./ui/auth"
import * as init from "./ui/init"
import * as node from "./ui/node"

process.env.API_URL = apiBaseUrl

// Handle graceful shutdown
process.on("SIGINT", () => {
  log.info("\nShutting down gracefully...")
  node.cleanup()
  process.exit(0)
})

process.on("SIGTERM", () => {
  log.info("\nShutting down gracefully...")
  node.cleanup()
  process.exit(0)
})

void (async () => {
  updateSettings({ withGuide: false })
  const helperResult = await init.helperCommands()
  if (helperResult.handled) {
    process.exit(helperResult.exitCode)
  }

  await init.printLogo()
  await auth.initUserSession()
  await node.doStuff()

  // Keep the process running to continue sending heartbeats
  // The process will only exit on SIGINT (Ctrl+C) or SIGTERM
})().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  logger.error({ error }, message)
  process.exit(1)
})
