import * as z from "zod"

export const CommandsFileSchema = z.object({
  safe: z
    .array(z.string())
    .default([])
    .describe(
      "Regexes (each must match the whole command) for commands that run without asking; managed by `kaja config fetch`"
    ),
  custom: z
    .array(z.string())
    .default([])
    .describe("Your own patterns, added to `safe` and kept when `kaja config fetch` refreshes the defaults")
})

export type KajaCommandsFile = z.infer<typeof CommandsFileSchema>
