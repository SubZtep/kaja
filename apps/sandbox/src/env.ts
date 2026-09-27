import { parseEnv, SandboxEnvSchema } from "@kaja/schema/env"

const result = parseEnv(SandboxEnvSchema, process.env)

if (!result.success) {
  console.error("Invalid environment variables:")
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
  }
  process.exit(1)
}

/** The production API a sandbox joins unless told otherwise; a dev checkout joins the local one. */
const DEFAULT_API_URL = result.data.NODE_ENV === "production" ? "https://api.kaja.io" : "http://localhost:3001"

export const env = { ...result.data, KAJA_API_URL: result.data.KAJA_API_URL ?? DEFAULT_API_URL }
