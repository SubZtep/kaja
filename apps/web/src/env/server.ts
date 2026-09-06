import { parseEnv, WebEnvSchema } from "@kaja/schema/env"

const result = parseEnv(WebEnvSchema, process.env)

if (!result.success) {
  console.error("Invalid environment variables:")
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = result.data
