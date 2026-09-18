import * as z from "zod"
import { SkillNameSchema } from "./skill"

/** The model-facing function name rule (OpenAI): letters, digits, `_` and `-`, up to 64 characters. */
const ToolFunctionNameSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "letters, digits, _ and - only, up to 64")

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"])

const PathSchema = z.string().startsWith("/", "must start with /")

// Where the key from secrets.toml's [packages.<name>] goes; `prefix` covers "Bearer " style headers.
export const HttpToolAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("apiKey"),
    in: z.enum(["header", "query"]),
    name: z.string().min(1).describe("Header or query parameter name"),
    prefix: z.string().optional().describe('Put before the key, e.g. "Bearer "'),
    optional: z.boolean().default(false).describe("The API works without a key too (e.g. with lower limits)")
  })
])

// One argument's JSON Schema, passed through untouched; `additionalProperties: true` keeps tombi's strict mode from treating it as a closed object.
const JsonSchemaValue = z.record(z.string(), z.unknown()).meta({ additionalProperties: true })

// JSON Schema for the tool's arguments, passed to the model as-is; only the outer shape is checked here.
const ParametersSchema = z.looseObject({
  type: z.literal("object"),
  properties: z.record(z.string(), JsonSchemaValue).default({}),
  required: z.array(z.string()).optional()
})

const PLACEHOLDER = /\{([^}]+)\}/g

/** `{name}` placeholders in a path template, in order. */
function pathPlaceholders(path: string): string[] {
  return [...path.matchAll(PLACEHOLDER)].map(match => match[1]!)
}

export const HttpToolSchema = z
  .object({
    name: ToolFunctionNameSchema,
    description: z.string().min(1).max(1024),
    method: HttpMethodSchema.default("GET"),
    path: PathSchema.describe("Appended to baseUrl; {param} placeholders are filled from the arguments"),
    parameters: ParametersSchema.default({ type: "object", properties: {} })
  })
  .superRefine((tool, ctx) => {
    for (const name of pathPlaceholders(tool.path)) {
      if (!(name in tool.parameters.properties)) {
        ctx.addIssue({ code: "custom", path: ["path"], message: `{${name}} isn't a declared parameter` })
      }
    }
  })

export const HttpToolPackageSchema = z
  .object({
    /** Must match the file name (marketplace/tools/<name>.toml). */
    name: SkillNameSchema,
    description: z.string().min(1).max(1024),
    baseUrl: z.url({ protocol: /^https?$/ }).describe("Scheme and host (plus optional base path) every tool calls"),
    auth: HttpToolAuthSchema.default({ type: "none" }),
    headers: z.record(z.string(), z.string()).default({}).describe("Static headers sent with every request"),
    check: z
      .object({ method: HttpMethodSchema.default("GET"), path: PathSchema })
      .optional()
      .describe("A cheap request kaja doctor sends to test the key; 2xx means it works"),
    tools: z.array(HttpToolSchema).min(1)
  })
  .superRefine((pkg, ctx) => {
    const seen = new Set<string>()
    pkg.tools.forEach((tool, index) => {
      if (seen.has(tool.name)) ctx.addIssue({ code: "custom", path: ["tools", index, "name"], message: "duplicate" })
      seen.add(tool.name)
    })
  })

export type HttpMethod = z.infer<typeof HttpMethodSchema>
export type HttpToolAuth = z.infer<typeof HttpToolAuthSchema>
export type HttpTool = z.infer<typeof HttpToolSchema>
export type HttpToolPackage = z.infer<typeof HttpToolPackageSchema>
