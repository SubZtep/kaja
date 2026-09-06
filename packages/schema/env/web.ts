import { trimmed, url } from "./helpers"
import { LoggerEnvSchema } from "./logger"

export const WebEnvSchema = LoggerEnvSchema.extend({
  API_URL: url
    .optional()
    .describe(
      "Server-to-server API base URL — set by compose/disco to the container-network address (e.g. http://api:3001); takes precedence over VITE_API_URL when both are set"
    ),
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
