import { z } from "zod"

/** Extra metadata a generator can read back via `.meta()` to render `.env.example` lines. */
export interface EnvFieldMeta {
  /** Sample value shown uncommented in `.env.example` (e.g. a URL). */
  example?: string
  /** Marks the field as sensitive — rendered commented with a generation hint. */
  secret?: boolean
  /** Groups fields under a comment header in `.env.example`. */
  section?: string
}

/** Trims surrounding whitespace from a string env value. */
export const trimmed = z.string().trim()

/** Loose boolean parse consistent with `@kaja/shared`'s `isItTrue`: `true`/`1`/`on`/`y…`. */
export const bool = z.preprocess(val => {
  if (typeof val !== "string") return val
  const normalized = val.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized.startsWith("y")
}, z.boolean())

/** Coerces a string env value to a positive integer. */
export const positiveInt = z.coerce.number().int().positive()

/** Trimmed, URL-shaped string. */
export const url = trimmed.pipe(z.url())

/**
 * Parses `source` (typically `process.env`) against `schema`, filtering out empty-string
 * values first so `FOO=` in a real `.env` file doesn't override a schema default. Returns the
 * Zod `safeParse` result unchanged — callers decide how to report failures (e.g. print issues
 * and exit) since this package stays free of process-level I/O.
 */
export function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, string | undefined>
): z.ZodSafeParseResult<z.infer<Schema>> {
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") filtered[key] = value
  }

  return schema.safeParse(filtered)
}
