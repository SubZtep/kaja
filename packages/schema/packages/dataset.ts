import * as z from "zod"

export const DatasetFieldSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  accepted: z.array(z.string().min(1)).optional()
})

// One file per topic (marketplace/datasets/<topic>.json); revalidateAfterDays makes a
// completed dataset expire after N days.
export const DatasetSchema = z.object({
  label: z.string().min(1),
  fields: z.array(DatasetFieldSchema).min(1),
  revalidateAfterDays: z.number().int().positive().optional(),
  profile: z
    .boolean()
    .optional()
    .describe("About the user: every persona sees the answers, and asks for the first field while it's missing")
})

/** The answer recorded when the user would rather not say, so the field counts as answered and isn't asked again. */
export const DECLINED_ANSWER = "prefer not to say"

export type DatasetField = z.infer<typeof DatasetFieldSchema>
export type Dataset = z.infer<typeof DatasetSchema>

/** Normalizes an answer for case/whitespace-insensitive comparison against `accepted` values. */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase()
}
