import * as z from "zod"
import { trimmed, url } from "./helpers"

export const TuiEnvSchema = z.object({
  KAJA_API_URL: url
    .optional()
    .describe(
      "Overrides [api].baseUrl from services.toml, for pointing the CLI at a local dev API without editing the file"
    ),
  KAJA_LOG_LEVEL: trimmed
    .optional()
    .describe("Minimum level written to KAJA_LOG_FILE (trace, debug, info, warn, error, fatal); unset means no log")
    .meta({ section: "Logging" }),
  KAJA_LOG_FILE: trimmed
    .optional()
    .describe("Append JSON-lines logs here (needs KAJA_LOG_LEVEL); the TUI never logs to the terminal")
    .meta({ section: "Logging" })
})
