import { url } from "./helpers"
import { LoggerEnvSchema } from "./logger"

export const CliEnvSchema = LoggerEnvSchema.extend({
  KAJA_API_URL: url
    .optional()
    .describe(
      "Overrides [api].baseUrl from services.toml, for pointing the CLI at a local dev API without editing the file"
    )
})
