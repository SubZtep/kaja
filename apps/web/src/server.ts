import { wrapFetchWithSentry } from "@sentry/tanstackstart-react"
import handler, { createServerEntry } from "@tanstack/react-start/server-entry"
import { paraglideMiddleware } from "./paraglide/server.js"

export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request: Request) {
      return paraglideMiddleware(request, () => handler.fetch(request))
    }
  })
)
