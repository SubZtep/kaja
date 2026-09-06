import * as Sentry from "@sentry/tanstackstart-react"

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: "https://96f4dd55ad041f9db78a1f9beadc1fac@o326475.ingest.us.sentry.io/4512040899444736"
  })
}
