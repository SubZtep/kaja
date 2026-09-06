import { parseEnv, trimmed, url } from "@kaja/schema/env"
import * as z from "zod"

export const EnvSchema = z.object({
  API_URL: url
    .optional()
    .describe(
      "Server-to-server API base URL — set by compose/disco to the container-network address (e.g. http://api:3001); takes precedence over VITE_API_URL when both are set"
    ),
  VITE_API_URL: url
    .describe("Browser-facing API base URL, baked into the client bundle")
    .meta({ example: "http://localhost:3001" }),
  VITE_APP_URL: url.optional().describe("Public web app URL").meta({ example: "http://localhost:3000" }),
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
  VITE_UMAMI_WEBSITE_ID: trimmed.optional().describe("Umami analytics website id").meta({
    example: "00000000-0000-4000-0000-000000000000"
  })
})

const result = parseEnv(EnvSchema, process.env)

if (!result.success) {
  console.error("Invalid environment variables:")
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = result.data
