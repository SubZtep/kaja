import * as z from "zod"
import { trimmed, url } from "./helpers"

export const TuiEnvSchema = z.object({
  KAJA_API_URL: url
    .optional()
    .describe("The Kaja API the CLI talks to, for pointing it at a local dev API; defaults to https://api.kaja.io"),
  KAJA_PROFILE: trimmed
    .optional()
    .describe(
      "Appended to the config, data, cache and temp folder names (kaja-<profile>), for separate setups side by side"
    ),
  KAJA_LOG_LEVEL: trimmed
    .optional()
    .describe("Minimum level written to the log (trace, debug, info, warn, error, fatal, or off); unset means warn")
    .meta({ section: "Logging" }),
  KAJA_LOG_FILE: trimmed
    .optional()
    .describe("Append JSON-lines logs here instead of kaja.log in the state folder; the TUI never logs to the terminal")
    .meta({ section: "Logging" })
})
