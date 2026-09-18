import * as z from "zod"

// Where `kaja pkg update` fetches the marketplace from; both default to the Kaja repo's `main`.
export const PackagesSourceSchema = z.object({
  url: z.string().min(1).optional().describe("Git URL (or local path) of the repo holding the marketplace/ folder"),
  ref: z.string().min(1).optional().describe("Branch or tag to fetch")
})

// Only packages listed here are loaded, whether they came from the marketplace or you wrote them.
export const PackagesFileSchema = z.object({
  source: PackagesSourceSchema.optional().describe("Marketplace repo override"),
  skills: z.array(z.string().min(1)).default([]).describe("Enabled skills, by folder name under marketplace/skills/"),
  tools: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled HTTP tool packages, by file name under marketplace/tools/"),
  mcp: z
    .array(z.string().min(1))
    .default([])
    .describe("Enabled MCP server packages, by file name under marketplace/mcp/")
})

export type PackagesFile = z.infer<typeof PackagesFileSchema>
export type PackagesSource = z.infer<typeof PackagesSourceSchema>
