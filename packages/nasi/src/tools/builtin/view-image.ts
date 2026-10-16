import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { type Tool, ToolError, tool } from "../../agent/agent"
import { ImageError, normalizeImage } from "../../images/normalize"
import { PathDeniedError, resolveWorkspacePath } from "../path-guard"

// Bigger files aren't read at all: no photo or screenshot comes near it.
const MAX_SOURCE_BYTES = 64 * 1024 * 1024

const expandHome = (path: string) => (path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path)

// Where the path really is, or undefined when it's never readable (secrets.toml, the conversation store).
function resolved(path: string) {
  try {
    return resolveWorkspacePath(expandHome(path))
  } catch (error) {
    if (error instanceof PathDeniedError) return undefined
    throw error
  }
}

/**
 * Lets the agent view an image file by returning it as a vision content block in the next model turn. Inside the folder
 * Kaja runs in it just looks; anywhere else it asks first, since the image goes to the model's provider. Never reads
 * secrets.toml or the conversation store, and refuses a file that isn't an image.
 *
 * @param args.path - Path to the image file.
 * @returns A {@link ToolResult} carrying the image, already model-sized (so its size is known before it's sent);
 * run() stores it and injects it as a vision content block in a follow-up user message.
 */
export const viewImageTool: Tool<{ path: string }> = {
  ...tool({
    name: "view_image",
    description: "View an image file (e.g. a screenshot or photo) so you can see its contents.",
    schema: z.object({
      path: z.string().describe("Path to the image file")
    }),
    execute: async args => {
      const where = resolved(args.path)
      if (!where) throw new ToolError("view_image", `Path is not readable: ${args.path}`)
      const source = Bun.file(where.path)
      if (!(await source.exists())) return `File not found: ${args.path}`
      if (source.size > MAX_SOURCE_BYTES) throw new ToolError("view_image", `Too large to view: ${args.path}`)
      try {
        const image = await normalizeImage(new Uint8Array(await source.arrayBuffer()))
        return { text: `Viewing image: ${args.path}`, images: [image] }
      } catch (error) {
        if (error instanceof ImageError) throw new ToolError("view_image", `${args.path}: ${error.message}`)
        throw error
      }
    }
  }),
  // The model's arguments, not yet checked: anything but a readable path outside the workspace goes on to execute.
  approval: args => {
    if (typeof args?.path !== "string") return undefined
    const where = resolved(args.path)
    return where && !where.inWorkspace ? `View ${args.path} (outside the folder Kaja runs in)` : undefined
  }
}
