import * as z from "zod"
import { trimmed, url } from "./helpers"

export const WebEnvSchema = z.object({
  API_URL: url
    .optional()
    .describe(
      "Server-to-server API base URL — the container-network address in compose (e.g. http://api:3001), the public API URL on Disco; takes precedence over VITE_API_URL when both are set"
    ),
  SSR_SECRET: trimmed
    .optional()
    .describe(
      "Shared with the API's SSR_SECRET; server-side session checks send it with the visitor's IP so the API rate-limits per visitor instead of per web host"
    )
    .meta({ secret: true }),
  VITE_API_URL: url
    .describe("Browser-facing API base URL, baked into the client bundle")
    .meta({ example: "http://localhost:3001" }),
  VITE_APP_URL: url.default("http://localhost:3000").describe("Public web app URL"),
  VITE_WIDGET_BARKOCHBA_KEY: trimmed
    .optional()
    .describe(
      "Widget key pinned to the barkochba persona, used by the landing page's playable hero demo. Intentionally public — the Origin allowlist is the real gate, not key secrecy."
    ),
  VITE_WIDGET_CHAT_KEY: trimmed
    .optional()
    .describe(
      "Second widget key, on a separate dedicated demo account, used by the landing page's embeddable chat widget script."
    ),
  SENTRY_AUTH_TOKEN: trimmed
    .optional()
    .describe("Sentry auth token used by the build-time Vite plugin to upload source maps")
    .meta({ secret: true })
})
