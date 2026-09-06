import * as z from "zod"
import { trimmed } from "./helpers"

/**
 * `@kaja/logger`'s own env contract - read raw via `process.env` inside that package (it can't
 * depend on `@kaja/schema`), but declared here once and merged into each app's schema so these
 * vars get real `.env.example` generation, `env.d.ts` typing, and `bun check:env` coverage too.
 */
export const LoggerEnvSchema = z.object({
  NODE_ENV: trimmed
    .optional()
    .describe("Selects @kaja/logger's node.ts destination: pretty-print in development, Axiom in production")
    .meta({ section: "Logging" }),
  KAJA_APP_NAME: trimmed.optional().describe("App name attached to every log line").meta({ section: "Logging" }),
  KAJA_LOG_LEVEL: trimmed
    .optional()
    .describe("Master on/off switch for logging - unset means no log output at all")
    .meta({ section: "Logging" }),
  KAJA_LOG_FILE: trimmed
    .optional()
    .describe("Append JSON logs here instead of pretty-printing/Axiom, in any NODE_ENV")
    .meta({ section: "Logging" }),
  AXIOM_DATASET: trimmed
    .optional()
    .describe("Axiom dataset to ship logs to (node, NODE_ENV=production, no KAJA_LOG_FILE)")
    .meta({ section: "Logging" }),
  AXIOM_TOKEN: trimmed
    .optional()
    .describe("Axiom ingest token (node, NODE_ENV=production, no KAJA_LOG_FILE)")
    .meta({ secret: true, section: "Logging" })
})
