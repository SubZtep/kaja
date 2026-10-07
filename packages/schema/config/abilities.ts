import * as z from "zod"

// Where `kaja abilities update` fetches the marketplace from; both default to the Kaja repo's `main`.
export const AbilitiesSourceSchema = z.object({
  url: z.string().min(1).optional().describe("Git URL (or local path) of the repo holding the marketplace/ folder"),
  ref: z.string().min(1).optional().describe("Branch or tag to fetch")
})

// Only abilities listed here are loaded, whether they came from the marketplace or you wrote them.
export const AbilitiesFileSchema = z.object({
  source: AbilitiesSourceSchema.optional().describe("Marketplace repo override"),
  skills: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled skills, by folder name under marketplace/abilities/"),
  tools: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled HTTP tool abilities (tool.toml), by folder name under marketplace/abilities/"),
  mcp: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled MCP server abilities (mcp.toml), by folder name under marketplace/abilities/"),
  personas: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled personas, by file name under marketplace/personas/ (default always loads)"),
  disabledTools: z
    .record(z.string().min(1), z.array(z.string().min(1)))
    .default({})
    .describe(
      "Tools to leave out, by HTTP tool or MCP ability name; an MCP ability needs a `tools` list for this. The rest (and tools it gains later) stay on"
    )
})

export type AbilitiesFile = z.infer<typeof AbilitiesFileSchema>
export type AbilitiesSource = z.infer<typeof AbilitiesSourceSchema>
