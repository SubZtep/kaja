import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"
import { loadSentry } from "./lib/sentry"

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>
  )
})

// Sentry starts once the page is idle, so it never competes with the first paint; an error before then loads it on the spot (captureError)
if ("requestIdleCallback" in window) requestIdleCallback(() => loadSentry(), { timeout: 4000 })
else setTimeout(loadSentry, 2000)
