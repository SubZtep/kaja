#!/usr/bin/env bun
import { error } from "@kaja/logger"
import { QueryClientProvider } from "@tanstack/react-query"
import { render } from "ink"
import BigText from "ink-big-text"
import Gradient from "ink-gradient"
import { handleArgs } from "./args"
import { App } from "./components/App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { queryClient } from "./lib/query-client"

handleArgs()

try {
  const { unmount, waitUntilExit } = render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Gradient name="rainbow">
          <BigText font="slick" text="kaja.io" />
        </Gradient>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  )

  const cleanup = () => unmount()
  process.on("SIGINT", cleanup)
  process.on("SIGTERM", cleanup)

  waitUntilExit()
    .then(() => process.exit())
    .catch(err => {
      error("App exited with error", { error: err })
      process.exit(1)
    })
} catch (err) {
  error("Failed to start CLI", { error: err })
  process.exit(1)
}
