import * as z from "zod"

export const SecretsApiSchema = z.object({
  token: z.string().min(1)
})

export const SecretsLocationSchema = z.object({
  apiKey: z.string().min(1)
})

export const SecretsWebSearchSchema = z.object({
  apiKey: z.string().min(1)
})

export const SecretsTelegramSchema = z.object({
  botToken: z.string().min(1)
})

// OpenCode Zen (https://opencode.ai/zen) API key.
export const SecretsZenSchema = z.object({
  apiKey: z.string().min(1)
})

// Keyed by the models.toml [providers.<name>] table it credentials.
const SecretsProviderSchema = z.object({
  api_key: z.string().min(1)
})

// Keyed by the mcp.toml [[servers]] id it credentials; values fold into that server's env (stdio) or headers (HTTP).
const SecretsMcpServerSchema = z.record(z.string(), z.string())

// The only file you should need to hand-edit for credentials. Every section
// here corresponds to a section/table in services.toml, models.toml, or
// mcp.toml, keyed the same way, and is folded back in by that file's loader.
export const SecretsFileSchema = z.object({
  api: SecretsApiSchema.optional(),
  location: SecretsLocationSchema.optional(),
  webSearch: SecretsWebSearchSchema.optional(),
  telegram: SecretsTelegramSchema.optional(),
  zen: SecretsZenSchema.optional(),
  providers: z.record(z.string(), SecretsProviderSchema).default({}),
  mcp: z.record(z.string(), SecretsMcpServerSchema).default({})
})

export type SecretsFile = z.infer<typeof SecretsFileSchema>
export type SecretsApi = z.infer<typeof SecretsApiSchema>
export type SecretsLocation = z.infer<typeof SecretsLocationSchema>
export type SecretsWebSearch = z.infer<typeof SecretsWebSearchSchema>
export type SecretsTelegram = z.infer<typeof SecretsTelegramSchema>
export type SecretsZen = z.infer<typeof SecretsZenSchema>
