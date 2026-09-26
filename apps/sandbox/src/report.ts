import * as Sentry from "@sentry/bun"

/** Starts Sentry in production for the sandbox's own failures only: no tracing, and no request headers (they carry the user's token). */
export function initReporting(env: { NODE_ENV?: string }) {
  if (env.NODE_ENV !== "production") return
  Sentry.init({
    dsn: "https://c8f04f802119c8ce54c8c63eba5e2b4c@o326475.ingest.us.sentry.io/4512150310486016",
    environment: "production",
    beforeSend(event) {
      if (event.request) delete event.request.headers
      return event
    }
  })
}

/** Reports a failure: container log, plus Sentry once it's initialised in production. */
export function reportError(message: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(message, { ...extra, error })
  Sentry.captureException(error, { extra: { message, ...extra } })
}
