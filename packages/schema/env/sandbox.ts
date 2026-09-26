import * as z from "zod"
import { positiveInt, trimmed } from "./helpers"

export const SandboxEnvSchema = z.object({
  NODE_ENV: trimmed.optional().describe('Node environment; "production" turns on Sentry'),
  PORT: positiveInt.default(3002).describe("Port the sandbox listens on"),
  SANDBOX_SECRET: trimmed
    .describe(
      "Shared with the API's SANDBOX_SECRET; verifies the tokens cloud turns and the admin dashboard's stats connect with"
    )
    .meta({ secret: true }),
  MARKETPLACE_DIR: trimmed
    .default("../../marketplace")
    .describe("Folder whose mcp/*.toml stdio manifests are the only servers the sandbox runs"),
  SANDBOX_OVERRIDES: trimmed
    .optional()
    .describe(
      "JSON file replacing a manifest's command/args for this host, e.g. a preinstalled binary and Chrome flags"
    )
    .meta({ example: "overrides.json" }),
  SANDBOX_IDLE_MS: positiveInt
    .default(10 * 60 * 1000)
    .describe("How long an unused server process is kept warm before it's stopped (ms)"),
  SANDBOX_MAX_PROCESSES: positiveInt
    .default(8)
    .describe("Most server processes running at once, over all users; each Chrome needs about 300-500 MB of RAM"),
  SANDBOX_EGRESS_PORT: positiveInt
    .default(3128)
    .describe("Port of the 127.0.0.1 proxy that keeps the browsers to public addresses; must match overrides.json")
})
