import * as z from "zod"

/**
 * Commands.toml: the user's own additions to the built-in list of shell commands that run without asking (nasi's
 * `DEFAULT_SAFE_COMMANDS`).
 */
export const CommandsFileSchema = z.object({
  custom: z
    .array(z.string())
    .default([])
    .describe(
      "Regexes for more commands that run without asking; each must match the whole command (it is anchored for you). A command with shell metacharacters, or one Kaja flags as dangerous, always asks"
    )
})

export type KajaCommandsFile = z.infer<typeof CommandsFileSchema>
