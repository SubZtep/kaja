import { z } from "zod"

/** Returned once, when a link is started — the raw token is never stored, only its hash. */
export const startTelegramLinkResponseSchema = z.object({
  token: z.string(),
  botUsername: z.string()
})

export type StartTelegramLinkResponse = z.infer<typeof startTelegramLinkResponseSchema>

/** Whether the signed-in user's account is linked to Telegram, and since when. */
export const telegramLinkStatusSchema = z.object({
  linked: z.boolean(),
  linkedAt: z.coerce.date().nullable()
})

export type TelegramLinkStatus = z.infer<typeof telegramLinkStatusSchema>
