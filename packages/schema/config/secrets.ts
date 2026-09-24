import * as z from "zod"

export const SecretsTelegramSchema = z.object({
  botToken: z.string().min(1)
})

// Keyed by the models.toml [providers.<name>] table it credentials.
const SecretsProviderSchema = z.object({
  api_key: z.string().min(1)
})

// Keyed by the mcp.toml [[servers]] id it credentials; values fold into that server's env (stdio) or headers (HTTP).
const SecretsMcpServerSchema = z.record(z.string(), z.string())

// Keyed by a marketplace/tools/<name>.toml ability; its manifest's `auth` says where the key goes.
const SecretsAbilitySchema = z.object({
  api_key: z.string().min(1)
})

// The only file you should need to hand-edit for credentials. The provider and mcp sections
// correspond to a table in models.toml or mcp.toml, keyed the same way, and are folded back in
// by that file's loader.
export const SecretsFileSchema = z.object({
  telegram: SecretsTelegramSchema.optional(),
  providers: z.record(z.string(), SecretsProviderSchema).default({}),
  mcp: z.record(z.string(), SecretsMcpServerSchema).default({}),
  abilities: z.record(z.string(), SecretsAbilitySchema).default({})
})

export type SecretsFile = z.infer<typeof SecretsFileSchema>
export type SecretsTelegram = z.infer<typeof SecretsTelegramSchema>
export type SecretsAbility = z.infer<typeof SecretsAbilitySchema>
