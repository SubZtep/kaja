import * as z from "zod"

export const SecretsTelegramSchema = z.object({
  bot_token: z.string().min(1),
  // Telegram user ids allowed to use the bot; `kaja telegram` pairs them with a one-time code.
  owner_ids: z.array(z.number().int().positive()).default([])
})

// Keyed by the models.toml [providers.<name>] table it credentials.
const SecretsProviderSchema = z.object({
  api_key: z.string().min(1)
})

// Keyed by a marketplace/abilities/<name>/ ability, one key for all its parts; each manifest's `auth` says where it goes.
const SecretsAbilitySchema = z.object({
  api_key: z.string().min(1)
})

// The only file you should need to hand-edit for credentials. A provider's key is keyed like its
// models.toml [providers.<name>] table, an ability's by its folder name.
export const SecretsFileSchema = z.object({
  telegram: SecretsTelegramSchema.optional(),
  providers: z.record(z.string(), SecretsProviderSchema).default({}),
  abilities: z.record(z.string(), SecretsAbilitySchema).default({})
})

export type SecretsFile = z.infer<typeof SecretsFileSchema>
export type SecretsTelegram = z.infer<typeof SecretsTelegramSchema>
export type SecretsAbility = z.infer<typeof SecretsAbilitySchema>
