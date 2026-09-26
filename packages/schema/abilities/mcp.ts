import * as z from "zod"
import { SkillNameSchema } from "./skill"

// Where the key from secrets.toml's [abilities.<name>] goes: a header for http/sse, an env var for stdio.
export const McpAbilityAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("apiKey"),
    in: z.enum(["header", "env"]),
    name: z.string().min(1).describe("Header or env var name"),
    prefix: z.string().optional().describe('Put before the key, e.g. "Bearer "'),
    optional: z.boolean().default(false).describe("The server works without a key too (e.g. with lower limits)")
  })
])

export const McpAbilitySchema = z
  .object({
    /** Must match the file name (marketplace/mcp/<name>.toml). */
    name: SkillNameSchema,
    description: z.string().min(1).max(1024),
    transport: z.enum(["http", "sse", "stdio"]).default("http").describe("http (Streamable HTTP), sse, or stdio"),
    url: z
      .url({ protocol: /^https?$/ })
      .optional()
      .describe("Server URL (http and sse)"),
    command: z.string().min(1).optional().describe("Command that starts the server (stdio)"),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}).describe("Static env vars for the server (stdio)"),
    headers: z.record(z.string(), z.string()).default({}).describe("Static headers (http and sse)"),
    auth: McpAbilityAuthSchema.default({ type: "none" }),
    approval: z
      .enum(["never", "writes", "always"])
      .default("never")
      .describe("When tool calls ask first: writes = unless the tool is marked read-only"),
    tools: z.array(z.string().min(1)).optional().describe("Only these of the server's tools reach the model"),
    localOnlyArgs: z
      .array(z.string().min(1))
      .optional()
      .describe(
        "Tool arguments that only make sense on the user's own machine (e.g. a file path to save to); the cloud hides them"
      ),
    readOnly: z
      .array(
        z.union([
          z.string().min(1),
          z.object({
            tool: z.string().min(1),
            unless: z.array(z.string().min(1)).default([]).describe("Arguments that make a call a write when set")
          })
        ])
      )
      .optional()
      .describe('Tools to treat as read-only under approval = "writes", for servers that don\'t mark them')
  })
  .superRefine((ability, ctx) => {
    const issue: IssueAt = (path, message) => ctx.addIssue({ code: "custom", path: [path], message })
    if (ability.transport === "stdio") checkStdio(ability, issue)
    else checkRemote(ability, issue)
  })

type IssueAt = (path: string, message: string) => void
type McpEndpoint = { transport: string; url?: string; command?: string; auth: { type: string; in?: string } }

// stdio starts a command and takes its key in an env var.
function checkStdio(ability: McpEndpoint, issue: IssueAt) {
  if (!ability.command) issue("command", "stdio needs a command")
  if (ability.url) issue("url", "stdio doesn't take a url")
  if (ability.auth.type === "apiKey" && ability.auth.in !== "env") issue("auth", 'stdio keys go in = "env"')
}

// http and sse reach a url and take their key in a header.
function checkRemote(ability: McpEndpoint, issue: IssueAt) {
  if (!ability.url) issue("url", `${ability.transport} needs a url`)
  if (ability.command) issue("command", `${ability.transport} doesn't take a command`)
  if (ability.auth.type === "apiKey" && ability.auth.in !== "header")
    issue("auth", `${ability.transport} keys go in = "header"`)
}

export type McpAbility = z.infer<typeof McpAbilitySchema>
export type McpAbilityAuth = z.infer<typeof McpAbilityAuthSchema>
/** A readOnly entry with the shorthand expanded: read-only unless one of `unless` is set in the call. */
export type McpReadOnlyRule = { tool: string; unless: string[] }

/** The MCP sandbox's per-host swap of a stdio manifest's command/args (e.g. a pinned package version and Chrome flags), by ability name. */
export const McpAbilityOverridesSchema = z.record(
  SkillNameSchema,
  z.object({
    command: z.string().min(1).optional().describe("Replaces the manifest's command"),
    args: z.array(z.string()).optional().describe("Replaces the manifest's args")
  })
)

export type McpAbilityOverrides = z.infer<typeof McpAbilityOverridesSchema>
