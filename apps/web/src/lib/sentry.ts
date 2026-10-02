import { version } from "../../package.json"

type SentrySdk = typeof import("./sentry-sdk")

let sdk: Promise<SentrySdk> | undefined

/** The Sentry SDK, downloaded and started on first use so it stays out of the browser's first load (the server's is started by instrument.server.mjs). */
export function loadSentry() {
  sdk ??= import("./sentry-sdk").then(Sentry => {
    if (!import.meta.env.SSR && import.meta.env.PROD) {
      Sentry.init({
        dsn: "https://96f4dd55ad041f9db78a1f9beadc1fac@o326475.ingest.us.sentry.io/4512040899444736",
        environment: "production",
        release: `kaja-web@${version}`
      })
    }
    return Sentry
  })
  return sdk
}

/** Reports an error to Sentry without waiting for the SDK to load. */
export function captureError(err: unknown) {
  loadSentry()
    .then(Sentry => Sentry.captureException(err))
    .catch(() => {})
}
