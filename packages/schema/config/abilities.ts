import * as z from "zod"

// Where `kaja abilities update` fetches the marketplace from; both default to the Kaja repo's `main`.
export const AbilitiesSourceSchema = z.object({
  url: z.string().min(1).optional().describe("Git URL (or local path) of the repo holding the marketplace/ folder"),
  ref: z.string().min(1).optional().describe("Branch or tag to fetch")
})

// Only abilities listed here are loaded, whether they came from the marketplace or you wrote them.
export const AbilitiesFileSchema = z.object({
  source: AbilitiesSourceSchema.optional().describe("Marketplace repo override"),
  skills: z.array(z.string().min(1)).default([]).describe("Enabled skills, by folder name under marketplace/skills/"),
  tools: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled HTTP tool abilities, by file name under marketplace/tools/"),
  mcp: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled MCP server abilities, by file name under marketplace/mcp/"),
  personas: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled personas, by file name under marketplace/personas/ (default always loads)")
})

export type AbilitiesFile = z.infer<typeof AbilitiesFileSchema>
export type AbilitiesSource = z.infer<typeof AbilitiesSourceSchema>
