import { z } from "zod"

/** What a message that is only a link does: ask the user (once), save it for later, or read it now. */
export const BARE_LINK_CHOICES = ["ask", "save", "read"] as const

/** One account's reading settings and state; every field has a default, so an account without a row has them all. */
export const ReadingSettingsSchema = z.object({
  bareLinks: z.enum(BARE_LINK_CHOICES).default("ask"),
  /** Whether Kaja looks for stories on the followed topics. */
  suggestions: z.boolean().default(true),
  /** When the account's last search ran: the next one only looks at what the sources offered since. */
  discoveredAt: z.iso.datetime().optional()
})

export type ReadingSettings = z.output<typeof ReadingSettingsSchema>
