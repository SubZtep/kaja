import * as Sentry from "@sentry/tanstackstart-react"

if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: "https://96f4dd55ad041f9db78a1f9beadc1fac@o326475.ingest.us.sentry.io/4512040899444736",
    environment: "production",
    ignoreErrors: [
      // A tab still running the previous deploy's bundle calls a server function id that no longer exists
      /^Server function info not found for /,
      // The visitor closed the connection mid-request
      /^The connection was closed\.$/
    ],
    beforeSend(event, hint) {
      // A thrown redirect() or notFound() is a Response: routing control flow, not an error
      if (hint.originalException instanceof Response) return null
      return event
    }
  })
}
