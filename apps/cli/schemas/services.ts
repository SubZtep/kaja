import * as z from "zod"

export const ServicesLocationSchema = z.object({
  serviceUrl: z.url(),
  apiKey: z.string().min(1)
})

export const ServicesWebSearchSchema = z.object({
  apiKey: z.string().min(1)
})

// OpenCode Zen free models (https://opencode.ai/zen). When set, the CLI's
// free-chat path forwards this key so requests use it instead of the
// server's DB-sourced provider key.
export const ServicesZenSchema = z.object({
  apiKey: z.string().min(1)
})

// botToken has no fallback (mandatory); allowedUserIds must be non-empty —
// an empty allowlist would make the bot silently unusable, and this group
// gates shell-command execution to whoever can message the bot.
export const ServicesTelegramSchema = z.object({
  botToken: z.string().min(1),
  allowedUserIds: z.array(z.number().int()).min(1)
})

// Only needed by commands that talk to the Kaja backend (e.g.
// `kaja config fetch`), unlike models.toml which is a local-provider file.
// `token` is the API's CONFIG_API_TOKEN (Bearer) for /config/* routes.
export const ServicesApiSchema = z.object({
  baseUrl: z.url(),
  token: z.string().min(1).optional()
})

// External service credentials: each group is independently optional — when
// absent, that feature is simply unavailable rather than crashing the app.
// Kept out of settings.json (which stays local UI/model config) since these
// are the fields most likely to hold real secrets a user pastes in once and
// otherwise leaves alone.
export const ServicesFileSchema = z.object({
  location: ServicesLocationSchema.optional(),
  webSearch: ServicesWebSearchSchema.optional(),
  telegram: ServicesTelegramSchema.optional(),
  api: ServicesApiSchema.optional(),
  zen: ServicesZenSchema.optional()
})

export type ServicesFile = z.infer<typeof ServicesFileSchema>
export type ServicesLocation = z.infer<typeof ServicesLocationSchema>
export type ServicesWebSearch = z.infer<typeof ServicesWebSearchSchema>
export type ServicesTelegram = z.infer<typeof ServicesTelegramSchema>
export type ServicesApi = z.infer<typeof ServicesApiSchema>
export type ServicesZen = z.infer<typeof ServicesZenSchema>
