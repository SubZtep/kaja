import type { z } from "zod"

export interface EnvFieldMeta {
  description?: string
  example?: string
  secret?: boolean
  section?: string
}

export interface FieldInfo {
  key: string
  description: string
  example?: string
  secret?: boolean
  section?: string
  isOptional: boolean
  defaultValue?: unknown
}

function isZodDefault(schema: z.ZodTypeAny): boolean {
  return (schema as unknown as { _zod: { def: { type: string } } })._zod.def.type === "default"
}

function defaultValueOf(schema: z.ZodTypeAny): unknown {
  return (schema as unknown as { _zod: { def: { defaultValue: unknown } } })._zod.def.defaultValue
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
      section: meta?.section,
      isOptional: fieldSchema.isOptional(),
      defaultValue: isZodDefault(fieldSchema) ? defaultValueOf(fieldSchema) : undefined
    }
  })
}
