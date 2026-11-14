import { z } from "zod"

/** One of a module's background jobs and how its rows are doing. */
export const adminModuleJobSchema = z.object({
  id: z.string(),
  /** `global` runs once for everyone, `user` once per account that has work for it. */
  scope: z.enum(["global", "user"]),
  everyMinutes: z.number().int(),
  /** Accounts with a row (1 for a global job that has started). */
  rows: z.number().int(),
  /** Rows whose last run failed. */
  failing: z.number().int(),
  /** One failing row's message. */
  error: z.string().nullable(),
  lastRunAt: z.coerce.date().nullable(),
  nextDueAt: z.coerce.date().nullable()
})

/** A module as an admin sees it; switched off, it has no tools, no prompt section and no jobs, for anyone. */
export const adminModuleSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  jobs: z.array(adminModuleJobSchema)
})

export const adminModulesResponseSchema = z.object({ modules: z.array(adminModuleSchema) })

export const updateAdminModuleSchema = z.object({ enabled: z.boolean() })

export type AdminModule = z.infer<typeof adminModuleSchema>
export type AdminModuleJob = z.infer<typeof adminModuleJobSchema>
export type AdminModulesResponse = z.infer<typeof adminModulesResponseSchema>
export type UpdateAdminModule = z.infer<typeof updateAdminModuleSchema>
