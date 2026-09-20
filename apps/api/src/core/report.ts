import * as Sentry from "@sentry/bun"

/** Reports a failure the code handles itself (so the Hono Sentry middleware never sees it): container log, plus Sentry once it's initialised in production. */
export function reportError(message: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(message, { ...extra, error })
  Sentry.captureException(error, { extra: { message, ...extra } })
}
