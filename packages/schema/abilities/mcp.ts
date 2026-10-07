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
    keyless: z
      .boolean()
      .default(false)
      .describe("The server works without a key too (e.g. with lower limits), so the ability is on without one")
  })
])

// Package names never start with a dash, so one can't pass as a runner's flag; the version after `@` is optional here (the marketplace pins it).
const NPM_SPEC = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.+-]+)?$/i
const PYPI_SPEC = /^[a-z0-9][\w.-]*(@[\w.!+-]+)?$/i
const DOCKER_IMAGE = /^[a-z0-9][\w./:-]*(@sha256:[a-f0-9]{64})?$/

/** A stdio server published as a package: the host starts it with whichever runner it has (see nasi's `resolveLaunch`). */
export const McpPackageSchema = z
  .object({
    npm: z
      .string()
      .regex(NPM_SPEC, "an npm package, e.g. @scope/name@1.2.3")
      .optional()
      .describe("npm package (name@version): run by Kaja's own bun, else npx or pnpm dlx"),
    pypi: z
      .string()
      .regex(PYPI_SPEC, "a PyPI package, e.g. name@1.2.3")
      .optional()
      .describe("PyPI package (name@version, its command named like it): run by uvx or pipx"),
    docker: z
      .string()
      .regex(DOCKER_IMAGE, "a Docker image, e.g. mcp/time@sha256:<digest>")
      .optional()
      .describe("Docker image (name:tag or name@sha256:digest): docker run, when nothing else can start it")
  })
  .refine(pkg => pkg.npm || pkg.pypi || pkg.docker, "name at least one of npm, pypi or docker")

export const McpAbilitySchema = z
  .object({
    description: z.string().min(1).max(1024),
    transport: z.enum(["http", "sse", "stdio"]).default("http").describe("http (Streamable HTTP), sse, or stdio"),
    url: z
      .url({ protocol: /^https?$/ })
      .optional()
      .describe("Server URL (http and sse)"),
    command: z
      .string()
      .min(1)
      .optional()
      .describe("Command that starts the server (stdio), for a server that isn't a package"),
    package: McpPackageSchema.optional().describe("The package that is the server (stdio), instead of a command"),
    args: z.array(z.string()).default([]).describe("The server's own arguments (after the package, with one)"),
    env: z.record(z.string(), z.string()).default({}).describe("Static env vars for the server (stdio)"),
    headers: z.record(z.string(), z.string()).default({}).describe("Static headers (http and sse)"),
    auth: McpAbilityAuthSchema.default({ type: "none" }),
    approval: z
      .enum(["never", "writes", "always"])
      .default("never")
      .describe("When tool calls ask first: writes = unless the tool is marked read-only"),
    tools: z.array(z.string().min(1)).optional().describe("Only these of the server's tools reach the model"),
    toolDescriptions: z
      .record(z.string().min(1), z.string().min(1).max(1024))
      .optional()
      .describe(
        "What each listed tool does, in a line, for the web's tool list (the server's own text only arrives at run time)"
      ),
    trustedSandbox: z
      .boolean()
      .default(false)
      .describe(
        "In the cloud, only the user's own MCP sandboxes or the official one run it, never one another person shares (stdio)"
      ),
    roots: z
      .boolean()
      .default(false)
      .describe(
        "The server works in folders the persona gives it (its abilities entry's `roots`), sent as MCP roots; off for a persona that gives none (stdio)"
      ),
    localOnly: z
      .boolean()
      .default(false)
      .describe("Only runs on the user's own machine, never in the cloud (e.g. it works on their files)"),
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
    for (const tool of Object.keys(ability.toolDescriptions ?? {}))
      if (!ability.tools?.includes(tool)) issue("toolDescriptions", `${tool} isn't in tools`)
  })

type IssueAt = (path: string, message: string) => void
type McpEndpoint = {
  transport: string
  url?: string
  command?: string
  package?: object
  roots?: boolean
  auth: { type: string; in?: string }
}

// stdio starts a command or a package and takes its key in an env var.
function checkStdio(ability: McpEndpoint, issue: IssueAt) {
  if (!ability.command && !ability.package) issue("command", "stdio needs a command or a package")
  if (ability.command && ability.package) issue("package", "give a command or a package, not both")
  if (ability.url) issue("url", "stdio doesn't take a url")
  if (ability.auth.type === "apiKey" && ability.auth.in !== "env") issue("auth", 'stdio keys go in = "env"')
}

// http and sse reach a url and take their key in a header.
function checkRemote(ability: McpEndpoint, issue: IssueAt) {
  if (!ability.url) issue("url", `${ability.transport} needs a url`)
  if (ability.command) issue("command", `${ability.transport} doesn't take a command`)
  if (ability.package) issue("package", `${ability.transport} doesn't take a package`)
  if (ability.auth.type === "apiKey" && ability.auth.in !== "header")
    issue("auth", `${ability.transport} keys go in = "header"`)
  if (ability.roots) issue("roots", "only stdio servers take roots")
}

/** A loaded MCP ability: its `mcp.toml` plus the ability's name, which is its folder's (marketplace/abilities/<name>/). */
export type McpAbility = z.infer<typeof McpAbilitySchema> & { name: string }
export type McpAbilityAuth = z.infer<typeof McpAbilityAuthSchema>
export type McpPackage = z.infer<typeof McpPackageSchema>
/** A readOnly entry with the shorthand expanded: read-only unless one of `unless` is set in the call. */
export type McpReadOnlyRule = { tool: string; unless: string[] }

/** The MCP sandbox's per-host swap of a stdio manifest's command (or package)/args (e.g. a pinned package version and Chrome flags), by ability name. */
export const McpAbilityOverridesSchema = z.record(
  SkillNameSchema,
  z.object({
    command: z.string().min(1).optional().describe("Replaces the manifest's command, or its package and the runner"),
    args: z.array(z.string()).optional().describe("Replaces the manifest's args")
  })
)

export type McpAbilityOverrides = z.infer<typeof McpAbilityOverridesSchema>
