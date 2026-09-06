import * as z from "zod"
import { url } from "./helpers"

export const CliEnvSchema = z.object({
  KAJA_API_URL: url
    .optional()
    .describe(
      "Overrides [api].baseUrl from services.toml, for pointing the CLI at a local dev API without editing the file"
    )
})
