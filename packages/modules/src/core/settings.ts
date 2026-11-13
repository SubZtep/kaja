import { jsonParam, readJson } from "@kaja/nasi"
import type { z } from "zod"
import type { ModuleContext } from "../contract"

/** One account's settings for a module, read and written whole. */
export type ModuleSettings<S extends z.ZodType> = {
  /** The stored settings through the schema; its defaults when nothing is stored (or what is no longer parses). */
  get(): Promise<z.output<S>>
  /** Merges `patch` over the stored settings and returns the result. */
  set(patch: Partial<z.input<S>>): Promise<z.output<S>>
}

/**
 * A module's per-account settings in `module_user`, shaped by the module's own schema (an object whose every field has
 * a default). The row is the account's and no channel's, like the module's other rows.
 */
export function moduleSettings<S extends z.ZodType>(
  ctx: Pick<ModuleContext, "sql" | "userId">,
  moduleId: string,
  schema: S
): ModuleSettings<S> {
  const { sql, userId } = ctx
  const stored = async (db: typeof sql): Promise<Record<string, unknown>> => {
    const [row] = await db<{ settings: unknown }[]>`
      SELECT settings FROM module_user WHERE user_id = ${userId} AND module = ${moduleId}`
    return row ? readJson<Record<string, unknown>>(row.settings) : {}
  }
  const parsed = (value: unknown): z.output<S> => {
    const result = schema.safeParse(value)
    return result.success ? result.data : schema.parse({})
  }
  return {
    get: async () => parsed(await stored(sql)),
    set: async patch => {
      let next = parsed({})
      await sql.begin(async tx => {
        next = schema.parse({ ...(await stored(tx)), ...patch })
        await tx`
          INSERT INTO module_user (user_id, module, settings, started_at)
          VALUES (${userId}, ${moduleId}, ${jsonParam(tx, next)}, ${new Date().toISOString()})
          ON CONFLICT (user_id, module) DO UPDATE SET settings = EXCLUDED.settings`
      })
      return next
    }
  }
}
