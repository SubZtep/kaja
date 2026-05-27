#!/usr/bin/env bun
import { QueryClientProvider } from "@tanstack/react-query"
import { render } from "ink"
import { handleArgs } from "./args"
import { App } from "./components/App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { logger } from "./lib/logger"
import { queryClient } from "./lib/query-client"

handleArgs()

try {
  const { unmount, waitUntilExit } = render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  )

  const cleanup = () => unmount()
  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  waitUntilExit()
    .then(() => process.exit())
    .catch(error => {
      logger.error({ error }, "App exited with error")
      process.exit(1)
    })
} catch (error) {
  logger.error({ error }, "Failed to start CLI")
  process.exit(1)
}
