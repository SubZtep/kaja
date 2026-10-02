import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"
import { captureError, type ReactErrorKind } from "./lib/sentry"

// Keeps React's console output, then hands the error to Sentry, which loads on the spot if it hasn't started yet
const reportTo = (kind: ReactErrorKind) => (error: unknown, info: { componentStack?: string | null }) => {
  console.error(error)
  captureError(error, { kind, componentStack: info.componentStack })
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    // Production only: dev keeps React's own handlers and overlay (and never starts Sentry)
    import.meta.env.PROD
      ? {
          onUncaughtError: reportTo("uncaught"),
          onCaughtError: reportTo("caught"),
          onRecoverableError: reportTo("recoverable")
        }
      : undefined
  )
})
