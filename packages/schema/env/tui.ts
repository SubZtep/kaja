import * as z from "zod"
import { trimmed, url } from "./helpers"

export const TuiEnvSchema = z.object({
  KAJA_API_URL: url
    .optional()
    .describe("The Kaja API the CLI talks to, for pointing it at a local dev API; defaults to https://api.kaja.io"),
  KAJA_LOG_LEVEL: trimmed
    .optional()
    .describe("Minimum level written to KAJA_LOG_FILE (trace, debug, info, warn, error, fatal); unset means no log")
    .meta({ section: "Logging" }),
  KAJA_LOG_FILE: trimmed
    .optional()
    .describe("Append JSON-lines logs here (needs KAJA_LOG_LEVEL); the TUI never logs to the terminal")
    .meta({ section: "Logging" })
})
