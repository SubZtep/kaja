import type { z } from "zod"

type EnvDefault = string | number | boolean

export interface EnvFieldMeta {
  description?: string
  example?: string
  secret?: boolean
  /** Ship `example` uncommented despite being optional — for a real, safe-to-commit working default (as opposed to a rotated secret). */
  devDefault?: boolean
  section?: string
}

export interface FieldInfo {
  key: string
  description: string
  example?: string
  secret?: boolean
  devDefault?: boolean
  section?: string
  isOptional: boolean
  defaultValue?: EnvDefault
}

function isZodDefault(schema: z.ZodTypeAny): boolean {
  return (schema as unknown as { _zod: { def: { type: string } } })._zod.def.type === "default"
}

// Env vars are flat .env-file values, so a schema's .default() is always a string/number/boolean —
// this narrows away `unknown` so callers can safely interpolate it without risking "[object Object]".
function defaultValueOf(schema: z.ZodTypeAny): string | number | boolean {
  return (schema as unknown as { _zod: { def: { defaultValue: string | number | boolean } } })._zod.def.defaultValue
}

/** Introspects a Zod env object's fields: description/example/secret/section metadata, optionality, and default value. */
export function inspectFields(schema: z.ZodObject<z.ZodRawShape>): FieldInfo[] {
  return Object.entries(schema.shape).map(([key, fieldSchema]) => {
    const meta = fieldSchema.meta?.() as EnvFieldMeta | undefined
    return {
      key,
      description: meta?.description ?? "",
      example: meta?.example,
      secret: meta?.secret,
      devDefault: meta?.devDefault,
      section: meta?.section,
      isOptional: fieldSchema.isOptional(),
      defaultValue: isZodDefault(fieldSchema) ? defaultValueOf(fieldSchema) : undefined
    }
  })
}
