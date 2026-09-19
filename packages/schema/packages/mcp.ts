import * as z from "zod"
import { SkillNameSchema } from "./skill"

// Where the key from secrets.toml's [packages.<name>] goes: a header for http/sse, an env var for stdio.
export const McpPackageAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("apiKey"),
    in: z.enum(["header", "env"]),
    name: z.string().min(1).describe("Header or env var name"),
    prefix: z.string().optional().describe('Put before the key, e.g. "Bearer "'),
    optional: z.boolean().default(false).describe("The server works without a key too (e.g. with lower limits)")
  })
])

export const McpPackageSchema = z
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
    auth: McpPackageAuthSchema.default({ type: "none" }),
    approval: z
      .enum(["never", "writes", "always"])
      .default("never")
      .describe("When tool calls ask first: writes = unless the tool is marked read-only"),
    tools: z.array(z.string().min(1)).optional().describe("Only these of the server's tools reach the model"),
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
  .superRefine((pkg, ctx) => {
    const issue: IssueAt = (path, message) => ctx.addIssue({ code: "custom", path: [path], message })
    if (pkg.transport === "stdio") checkStdio(pkg, issue)
    else checkRemote(pkg, issue)
  })

type IssueAt = (path: string, message: string) => void
type McpEndpoint = { transport: string; url?: string; command?: string; auth: { type: string; in?: string } }

// stdio starts a command and takes its key in an env var.
function checkStdio(pkg: McpEndpoint, issue: IssueAt) {
  if (!pkg.command) issue("command", "stdio needs a command")
  if (pkg.url) issue("url", "stdio doesn't take a url")
  if (pkg.auth.type === "apiKey" && pkg.auth.in !== "env") issue("auth", 'stdio keys go in = "env"')
}

// http and sse reach a url and take their key in a header.
function checkRemote(pkg: McpEndpoint, issue: IssueAt) {
  if (!pkg.url) issue("url", `${pkg.transport} needs a url`)
  if (pkg.command) issue("command", `${pkg.transport} doesn't take a command`)
  if (pkg.auth.type === "apiKey" && pkg.auth.in !== "header") issue("auth", `${pkg.transport} keys go in = "header"`)
}

export type McpPackage = z.infer<typeof McpPackageSchema>
export type McpPackageAuth = z.infer<typeof McpPackageAuthSchema>
/** A readOnly entry with the shorthand expanded: read-only unless one of `unless` is set in the call. */
export type McpReadOnlyRule = { tool: string; unless: string[] }
