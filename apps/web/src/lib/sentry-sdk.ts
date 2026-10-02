// The only Sentry calls the app makes, as named exports: a dynamic import of the whole package would keep all of it (Replay, Feedback, …)
export { captureException, init } from "@sentry/tanstackstart-react"
