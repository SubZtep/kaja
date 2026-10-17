import * as z from "zod"

export const HooksFileSchema = z.object({
  message: z
    .string()
    .optional()
    .describe(
      "Shell one-liner run in the background whenever the assistant writes in the chat; the reply as plain text is in $KAJA_TEXT and on stdin"
    ),
  question: z
    .string()
    .optional()
    .describe(
      "Shell one-liner run in the background whenever Kaja asks you a question; the question as plain text is in $KAJA_TEXT and on stdin"
    )
})

export type KajaHooksFile = z.infer<typeof HooksFileSchema>
