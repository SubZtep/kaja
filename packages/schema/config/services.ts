import * as z from "zod"

export const ServicesLocationSchema = z.object({
  serviceUrl: z.url()
})

// allowedUserIds gates who can trigger shell commands via the bot; must be non-empty.
export const ServicesTelegramSchema = z.object({
  allowedUserIds: z.array(z.number().int()).min(1)
})

// Kaja server used by `kaja config fetch`.
export const ServicesApiSchema = z.object({
  baseUrl: z.url()
})

// Non-secret service config; credentials for these same sections live in secrets.toml.
export const ServicesFileSchema = z.object({
  location: ServicesLocationSchema.optional(),
  telegram: ServicesTelegramSchema.optional(),
  api: ServicesApiSchema.optional()
})

export type ServicesFile = z.infer<typeof ServicesFileSchema>
export type ServicesLocation = z.infer<typeof ServicesLocationSchema>
export type ServicesTelegram = z.infer<typeof ServicesTelegramSchema>
export type ServicesApi = z.infer<typeof ServicesApiSchema>
