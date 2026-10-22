import { z } from "zod"
import { type ToolContext, ToolError, type ToolResult, tool } from "../../agent/agent"
import { MAX_IMAGE_EDGE } from "../../images/normalize"
import { imageRefId } from "../../store/images"

const NAME = "edit_image"
const MAX_STEPS = 12

const step = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("resize"),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional()
    })
    .describe("Resize to pixels; give one side to keep the aspect ratio"),
  z.object({ op: z.literal("rotate"), degrees: z.number().describe("Clockwise, a multiple of 90") }),
  z.object({ op: z.literal("flip"), direction: z.enum(["horizontal", "vertical"]) }),
  z.object({ op: z.literal("brightness"), amount: z.number().min(-1).max(1).describe("-1 darker … 1 brighter") }),
  z.object({ op: z.literal("greyscale") })
])

type Step = z.infer<typeof step>

const schema = z.object({
  image: z.string().describe("The image's kaja-image: link"),
  steps: z.array(step).min(1).max(MAX_STEPS).describe("Applied in order")
})

/**
 * Edits one of the conversation's images (resize, rotate, flip, brightness, greyscale) into a new image, which run()
 * stores and shows; the original stays as it was.
 *
 * @param args.image - The image's `kaja-image:` link.
 * @param args.steps - The edits, applied in order.
 */
export const editImageTool = tool({
  name: NAME,
  description:
    "Edit an image from this conversation into a new one, shown to the user: resize, rotate by a multiple of 90°, " +
    "flip, adjust brightness or turn it greyscale. The original image stays; the result gets its own kaja-image: link.",
  schema,
  execute: async (args, ctx?: ToolContext): Promise<ToolResult> => {
    const id = imageRefId(args.image)
    if (!id) throw new ToolError(NAME, "Pass an image's kaja-image: link.")
    const source = await ctx?.images?.get(id)
    if (!source) throw new ToolError(NAME, `No image ${args.image} in this conversation.`)
    const mimeType = source.mimeType === "image/png" ? "image/png" : "image/jpeg"
    let data = source.data
    try {
      // Bun.Image runs its operations in a fixed order, so each step is its own pass to keep the model's order
      for (const [i, s] of args.steps.entries()) {
        const image = await applyStep(data, s)
        data = await (i === args.steps.length - 1 && mimeType === "image/jpeg"
          ? image.jpeg({ quality: 90 })
          : image.png()
        ).bytes()
      }
    } catch (error) {
      if (error instanceof ToolError) throw error
      throw new ToolError(NAME, `Couldn't edit ${args.image}: ${error instanceof Error ? error.message : error}`)
    }
    const done = args.steps.map(s => s.op).join(", ")
    return { text: `Edited ${args.image} (${done})`, images: [{ data, mimeType }] }
  }
})

async function applyStep(data: Uint8Array, s: Step): Promise<Bun.Image> {
  const image = new Bun.Image(data)
  switch (s.op) {
    case "resize": {
      if (!s.width && !s.height) throw new ToolError(NAME, "resize needs a width or a height.")
      const { width, height } = await image.metadata()
      const w = Math.min(s.width ?? Math.round((width * s.height!) / height), MAX_IMAGE_EDGE)
      const h = Math.min(s.height ?? Math.round((height * s.width!) / width), MAX_IMAGE_EDGE)
      return image.resize(w, h)
    }
    case "rotate":
      if (s.degrees % 90 !== 0) throw new ToolError(NAME, "rotate takes a multiple of 90 degrees.")
      return image.rotate(s.degrees)
    case "flip":
      return s.direction === "horizontal" ? image.flop() : image.flip()
    case "brightness":
      return image.modulate({ brightness: 1 + s.amount })
    case "greyscale":
      return image.modulate({ saturation: 0 })
  }
}
