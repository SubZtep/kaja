import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { type Tool, tool, type ToolContext, ToolError, type ToolResult } from "../../agent/agent"
import { ImageError, normalizeImage } from "../../images/normalize"
import { imageRefId } from "../../store/images"
import { PathDeniedError, resolveWorkspacePath } from "../path-guard"

// Bigger files aren't read at all: no photo or screenshot comes near it.
const MAX_SOURCE_BYTES = 64 * 1024 * 1024

const NAME = "view_image"
const DESCRIPTION =
  "View an image so you can see its contents: an image file (e.g. a screenshot or photo), or an image from this " +
  "conversation by its kaja-image: link."
const schema = z.object({
  path: z.string().describe("Path to the image file, or an image's kaja-image: link")
})

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

/** An image of this conversation, by its `kaja-image:` link, read back from the session's store. */
async function viewLinked(link: string, ctx: ToolContext | undefined): Promise<ToolResult> {
  const id = imageRefId(link)!
  const image = await ctx?.images?.get(id)
  if (!image) throw new ToolError(NAME, `No image ${link} in this conversation.`)
  return { text: `Viewing image: ${link}`, images: [image] }
}

async function viewFile(path: string): Promise<string | ToolResult> {
  const where = resolved(path)
  if (!where) throw new ToolError(NAME, `Path is not readable: ${path}`)
  const source = Bun.file(where.path)
  if (!(await source.exists())) return `File not found: ${path}`
  if (source.size > MAX_SOURCE_BYTES) throw new ToolError(NAME, `Too large to view: ${path}`)
  try {
    const image = await normalizeImage(new Uint8Array(await source.arrayBuffer()))
    return { text: `Viewing image: ${path}`, images: [image] }
  } catch (error) {
    if (error instanceof ImageError) throw new ToolError(NAME, `${path}: ${error.message}`)
    throw error
  }
}

/**
 * Lets the agent view an image: a file, or one of the conversation's by its link. Inside the folder Kaja runs in a file
 * is just looked at; anywhere else it asks first, since the image goes to the model's provider. Never reads
 * secrets.toml or the conversation store, and refuses a file that isn't an image.
 *
 * @param args.path - Path to the image file, or a `kaja-image:` link.
 * @returns A {@link ToolResult} carrying the image, model-sized; run() stores it and shows it to the model.
 */
export const viewImageTool: Tool<{ path: string }> = {
  ...tool({
    name: NAME,
    description: DESCRIPTION,
    schema,
    execute: async (args, ctx) => (imageRefId(args.path) ? viewLinked(args.path, ctx) : viewFile(args.path))
  }),
  // The model's arguments, not yet checked: anything but a readable path outside the workspace goes on to execute.
  approval: args => {
    if (typeof args?.path !== "string" || imageRefId(args.path)) return undefined
    const where = resolved(args.path)
    return where && !where.inWorkspace ? `View ${args.path} (outside the folder Kaja runs in)` : undefined
  }
}

/** View_image where there are no files to read (a cloud turn): only the conversation's own images, by link. */
export const viewLinkedImageTool: Tool<{ path: string }> = tool({
  name: NAME,
  description: "View an image from this conversation by its kaja-image: link, so you can see its contents.",
  schema: z.object({ path: z.string().describe("The image's kaja-image: link") }),
  execute: async (args, ctx) => {
    if (!imageRefId(args.path)) throw new ToolError(NAME, "Only an image's kaja-image: link can be viewed here.")
    return viewLinked(args.path, ctx)
  }
})
