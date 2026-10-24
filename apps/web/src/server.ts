import { wrapFetchWithSentry } from "@sentry/tanstackstart-react"
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { forwardSentryEnvelope, SENTRY_TUNNEL_PATH } from "./lib/sentry-tunnel"
import { paraglideMiddleware } from "./paraglide/server.js"

const app = wrapFetchWithSentry({
  fetch(request: Request) {
    return paraglideMiddleware(request, () => handler.fetch(request))
  }
})

export default createServerEntry({
  fetch(request: Request) {
    // The tunnel skips Sentry's own tracing and Paraglide's locale redirects
    if (request.method === "POST" && new URL(request.url).pathname === SENTRY_TUNNEL_PATH) {
      return forwardSentryEnvelope(request)
    }
    return app.fetch(request)
  }
})
