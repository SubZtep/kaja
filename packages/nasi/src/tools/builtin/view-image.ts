import { file } from "bun"
import { z } from "zod"
import { tool } from "../../agent/agent"

/**
 * Lets the agent view an image file by returning it as a vision content
 * block in the next model turn.
 *
 * @param args.path - Path to the image file.
 * @returns A {@link ToolResult} carrying the image; run() injects it as a
 * vision content block in a follow-up user message.
 */
export const viewImageTool = tool({
  name: "view_image",
  description: "View an image file (e.g. a screenshot or photo) so you can see its contents.",
  schema: z.object({
    path: z.string().describe("Path to the image file")
  }),
  execute: async args => {
    const f = file(args.path)
    if (!(await f.exists())) return `File not found: ${args.path}`
    return {
      text: `Viewing image: ${args.path}`,
      images: [{ path: args.path, mimeType: f.type }]
    }
  }
})
