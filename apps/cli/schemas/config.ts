import * as z from "zod"

export const KajaSettingsSchema = z.object({
  thinking: z.boolean().optional(),
  sounds: z.boolean().optional(),
  voice: z.boolean().optional(),
  language: z.enum(["en", "hu"]).optional(),
  // Id of the last-selected persona (see schemas/personas.ts), so the app
  // reopens with it instead of always defaulting to the first one.
  persona: z.string().min(1).optional()
})

// Every task (chat, embedding, rerank, image-generation, text-to-speech,
// speech-to-text) resolves through models.toml the same way: the value here
// is a models.toml `id`, looked up for its provider credentials + model
// name (see lib/models.ts resolveModelById). chat is mandatory — this is a
// chat app, no meaningful mode without it; every other task is opt-in.
export const KajaModelsSchema = z.object({
  chat: z.string().min(1),
  embedding: z.string().min(1).optional(),
  rerank: z.string().min(1).optional(),
  "image-generation": z.string().min(1).optional(),
  "text-to-speech": z.string().min(1).optional(),
  "speech-to-text": z.string().min(1).optional()
})

// Feature groups: each is a self-contained block of config for one feature.
// stt/tts/location/webSearch are optional — when a group is absent, that
// feature is simply unavailable rather than crashing the app. Only the
// non-model settings live here now — the model itself comes from
// models.<task> above.
export const KajaSttSchema = z.object({
  speachesUrl: z.url().optional(),
  language: z.string().min(1).optional()
})

export const KajaTtsSchema = z.object({
  speachesUrl: z.url().optional(),
  voice: z.string().min(1).optional()
})

export const KajaMemorySchema = z.object({
  // Absolute path to the SQLite database file. Omit to use the default XDG
  // data location (see lib/memory-store.ts).
  dbPath: z.string().min(1).optional()
})

// location/webSearch/telegram/api (external service credentials) live in
// services.toml instead (see schemas/services.ts) — config.json stays
// local UI/model config.
export const KajaConfigSchema = z.object({
  models: KajaModelsSchema,
  stt: KajaSttSchema.optional(),
  tts: KajaTtsSchema.optional(),
  memory: KajaMemorySchema.optional(),
  // In-app preferences (slash menu); optional so existing configs stay valid.
  settings: KajaSettingsSchema.optional()
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaSettings = z.infer<typeof KajaSettingsSchema>
export type KajaModels = z.infer<typeof KajaModelsSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
