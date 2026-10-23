import * as z from "zod"

export const HookCommandSchema = z.object({
  run: z
    .string()
    .min(1)
    .describe(
      "Shell one-liner run in the background; the event's plain text is in $KAJA_TEXT and on stdin, its title in $KAJA_TITLE, the downloaded sounds folder in $KAJA_SOUNDS"
    ),
  cancel: z
    .union([z.boolean(), z.string().min(1)])
    .optional()
    .describe(
      'Stop the still-running previous run before starting this one: true cancels a run of this same command, a name cancels any command that has the same name (e.g. one "speech" for every espeak-ng)'
    )
})

const commands = (when: string) =>
  z.array(HookCommandSchema).optional().describe(`Commands started in parallel ${when}`)

export const HooksFileSchema = z.object({
  message: commands("whenever the assistant writes in the chat"),
  question: commands("whenever Kaja asks you a question with a tool"),
  confirm: commands("whenever Kaja needs your approval for a command or tool call"),
  reasoning: commands("whenever the assistant starts thinking"),
  tool_call: commands("whenever the assistant calls a tool"),
  notice: commands("whenever the chat shows a notice, like a condensed conversation"),
  persona_switch: commands("whenever the persona changes"),
  error: commands("whenever something goes wrong"),
  copy: commands("after a message was copied to the clipboard"),
  login_code: commands("when the sign-in code was copied because the browser could not be opened")
})

export type HookCommand = z.infer<typeof HookCommandSchema>
export type KajaHooksFile = z.infer<typeof HooksFileSchema>
export type HookName = keyof KajaHooksFile

export const SoundsManifestSchema = z.object({
  files: z.array(z.object({ name: z.string().min(1), size: z.number().int().nonnegative(), sha256: z.string().min(1) }))
})

export type SoundsManifest = z.infer<typeof SoundsManifestSchema>
