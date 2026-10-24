import * as z from "zod"

export const SecretsTelegramSchema = z.object({
  bot_token: z.string().min(1).describe("The bot's token from @BotFather"),
  owner_ids: z
    .array(z.number().int().positive())
    .default([])
    .describe("Telegram user ids the bot answers; `kaja telegram` adds one when someone sends it the pairing code")
})

const SecretsProviderSchema = z.union([
  z.object({ api_key: z.string().min(1).describe("The provider's API key; Ollama needs one but ignores its value") }),
  z.object({
    api_key_env: z
      .string()
      .regex(/^[A-Za-z_]\w*$/)
      .describe(
        "The environment variable holding the key, e.g. OPENAI_API_KEY: read when Kaja starts, never copied here"
      )
  })
])

const SecretsAbilitySchema = z.object({
  api_key: z.string().min(1).describe("The ability's key; its manifest's `auth` says where it goes")
})

/** Secrets.toml: the one file for credentials. `kaja doctor` asks for anything missing, tests it and saves it here. */
export const SecretsFileSchema = z.object({
  telegram: SecretsTelegramSchema.optional().describe("The bot `kaja telegram` runs"),
  providers: z
    .record(z.string(), SecretsProviderSchema)
    .default({})
    .describe("Keys for models.toml's providers, keyed like its [providers.<name>] tables"),
  abilities: z
    .record(z.string(), SecretsAbilitySchema)
    .default({})
    .describe("Keys for marketplace abilities, keyed by the ability's name, one for all its parts")
})

export type SecretsFile = z.infer<typeof SecretsFileSchema>
export type SecretsTelegram = z.infer<typeof SecretsTelegramSchema>
export type SecretsAbility = z.infer<typeof SecretsAbilitySchema>
export type SecretsProvider = z.infer<typeof SecretsProviderSchema>

/** A provider's key: the one saved, or what the environment variable it names holds (undefined when that's unset). */
export function providerKey(
  entry: SecretsProvider | undefined,
  env: Record<string, string | undefined> = process.env
): string | undefined {
  if (!entry) return undefined
  return "api_key" in entry ? entry.api_key : env[entry.api_key_env] || undefined
}
