import * as z from "zod"

export const ServicesLocationSchema = z.object({
  serviceUrl: z.url(),
  apiKey: z.string().min(1)
})

export const ServicesWebSearchSchema = z.object({
  apiKey: z.string().min(1)
})

// OpenCode Zen (https://opencode.ai/zen) API key.
export const ServicesZenSchema = z.object({
  apiKey: z.string().min(1)
})

// allowedUserIds gates who can trigger shell commands via the bot; must be non-empty.
export const ServicesTelegramSchema = z.object({
  botToken: z.string().min(1),
  allowedUserIds: z.array(z.number().int()).min(1)
})

// Kaja server used by `kaja config fetch`; token is CONFIG_API_TOKEN.
export const ServicesApiSchema = z.object({
  baseUrl: z.url(),
  token: z.string().min(1).optional()
})

// External service credentials, kept separate from settings.toml (local/UI config).
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
