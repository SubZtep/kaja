import { z } from "zod"

/** Returned once, when a link is started — the raw token is never stored, only its hash. */
export const startTelegramLinkResponseSchema = z.object({
  token: z.string(),
  botUsername: z.string()
})

export type StartTelegramLinkResponse = z.infer<typeof startTelegramLinkResponseSchema>
