import { Jimp } from "jimp"
import { z } from "zod"
import { type ToolContext, ToolError, type ToolResult, tool } from "../../agent/agent"
import { MAX_IMAGE_EDGE } from "../../images/normalize"
import { imageRefId } from "../../store/images"

const NAME = "edit_image"
/** A zoomed region is enlarged until its longer side is this, so small detail becomes readable. */
const ZOOM_EDGE = 1024
const MAX_STEPS = 12
/** Annotation colours by name; anything else must be a #rrggbb hex. */
const COLORS: Record<string, number> = {
  red: 0xff2d2dff,
  yellow: 0xffd400ff,
  green: 0x22c55eff,
  blue: 0x3b82f6ff,
  white: 0xffffffff,
  black: 0x000000ff
}

type Image = Awaited<ReturnType<typeof Jimp.read>>

const fraction = z.number().min(0).max(1)
/** A part of the image as fractions of its size: (0, 0) is the top-left corner. */
const region = {
  x: fraction.describe("Left edge, 0–1 of the width"),
  y: fraction.describe("Top edge, 0–1 of the height"),
  width: z.number().gt(0).max(1).describe("0–1 of the width"),
  height: z.number().gt(0).max(1).describe("0–1 of the height")
}
const color = z.string().optional().describe("red (default), yellow, green, blue, white, black, or #rrggbb")
// An array, not a tuple: a tuple's `items: false` is a schema llama.cpp can't turn into a grammar
const point = z.array(fraction).length(2).describe("[x, y] as 0–1 fractions of the width and height")

const step = z.discriminatedUnion("op", [
  z.object({ op: z.literal("crop"), ...region }).describe("Keep only this region"),
  z.object({ op: z.literal("zoom"), ...region }).describe("Crop to this region and enlarge it to read small detail"),
  z
    .object({
      op: z.literal("resize"),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional()
    })
    .describe("Resize to pixels; give one side to keep the aspect ratio"),
  z.object({ op: z.literal("rotate"), degrees: z.number().describe("Clockwise") }),
  z.object({ op: z.literal("flip"), direction: z.enum(["horizontal", "vertical"]) }),
  z.object({ op: z.literal("brightness"), amount: z.number().min(-1).max(1).describe("-1 darker … 1 brighter") }),
  z.object({ op: z.literal("contrast"), amount: z.number().min(-1).max(1).describe("-1 flatter … 1 punchier") }),
  z.object({ op: z.literal("greyscale") }),
  z.object({ op: z.literal("invert") }),
  z.object({ op: z.literal("sepia") }),
  z.object({ op: z.literal("blur"), radius: z.number().int().min(1).max(50).describe("Pixels") }),
  z.object({ op: z.literal("sharpen") }),
  z
    .object({ op: z.literal("pixelate"), ...partial(region), blocks: z.number().int().min(4).max(200).optional() })
    .describe("Pixelate the region (the whole image without one), e.g. to hide a face; blocks across, default 24"),
  z.object({ op: z.literal("box"), ...region, color }).describe("Draw an outline around a region"),
  z.object({ op: z.literal("arrow"), from: point, to: point, color }).describe("Draw an arrow pointing at `to`")
])

type Step = z.infer<typeof step>

const schema = z.object({
  image: z.string().describe("The image's kaja-image: link"),
  steps: z.array(step).min(1).max(MAX_STEPS).describe("Applied in order")
})

function partial<T extends Record<string, z.ZodType>>(shape: T) {
  return Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.optional()])) as {
    [K in keyof T]: z.ZodOptional<T[K]>
  }
}

/**
 * Edits one of the conversation's images (crop, zoom, resize, rotate, flip, tone, filters, annotations) into a new
 * image, which run() stores and shows; the original stays as it was.
 *
 * @param args.image - The image's `kaja-image:` link.
 * @param args.steps - The edits, applied in order; regions are 0–1 fractions of the image as it is at that step.
 */
export const editImageTool = tool({
  name: NAME,
  description:
    "Edit an image from this conversation into a new one, shown to the user: crop, zoom into a detail, resize, " +
    "rotate, flip, adjust brightness/contrast, greyscale, invert, sepia, blur, sharpen, pixelate a region, or draw " +
    "a box or an arrow to point something out. Regions and points are 0–1 fractions of the image (0,0 top-left). " +
    "The original image stays; the result gets its own kaja-image: link.",
  schema,
  execute: async (args, ctx?: ToolContext): Promise<ToolResult> => {
    const id = imageRefId(args.image)
    if (!id) throw new ToolError(NAME, "Pass an image's kaja-image: link.")
    const source = await ctx?.images?.get(id)
    if (!source) throw new ToolError(NAME, `No image ${args.image} in this conversation.`)
    let image: Image
    try {
      image = await Jimp.read(Buffer.from(source.data))
    } catch (error) {
      throw new ToolError(NAME, `Couldn't read ${args.image}: ${error instanceof Error ? error.message : error}`)
    }
    let transparent = source.mimeType === "image/png"
    for (const s of args.steps) {
      applyStep(image, s)
      if (s.op === "rotate" && s.degrees % 90 !== 0) transparent = true
    }
    const mimeType = transparent ? "image/png" : "image/jpeg"
    const data = new Uint8Array(
      mimeType === "image/png"
        ? await image.getBuffer("image/png")
        : await image.getBuffer("image/jpeg", { quality: 90 })
    )
    const done = args.steps.map(s => s.op).join(", ")
    return { text: `Edited ${args.image} (${done})`, images: [{ data, mimeType }] }
  }
})

// jimp edits the image in place
function applyStep(image: Image, s: Step): void {
  const { width, height } = image.bitmap
  switch (s.op) {
    case "crop":
      image.crop(pixelRegion(image, s))
      return
    case "zoom": {
      image.crop(pixelRegion(image, s))
      const scale = ZOOM_EDGE / Math.max(image.bitmap.width, image.bitmap.height)
      if (scale > 1) image.scale(scale)
      return
    }
    case "resize": {
      if (!s.width && !s.height) throw new ToolError(NAME, "resize needs a width or a height.")
      const w = Math.min(s.width ?? Math.round((width * s.height!) / height), MAX_IMAGE_EDGE)
      const h = Math.min(s.height ?? Math.round((height * s.width!) / width), MAX_IMAGE_EDGE)
      image.resize({ w, h })
      return
    }
    case "rotate":
      // jimp turns counter-clockwise for a positive angle
      image.rotate(-s.degrees)
      return
    case "flip":
      image.flip({ horizontal: s.direction === "horizontal", vertical: s.direction === "vertical" })
      return
    case "brightness":
      image.brightness(1 + s.amount)
      return
    case "contrast":
      image.contrast(s.amount)
      return
    case "greyscale":
      image.greyscale()
      return
    case "invert":
      image.invert()
      return
    case "sepia":
      image.sepia()
      return
    case "blur":
      image.blur(s.radius)
      return
    case "sharpen":
      image.convolute([
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
      ])
      return
    case "pixelate": {
      const area = pixelRegion(image, {
        x: s.x ?? 0,
        y: s.y ?? 0,
        width: s.width ?? 1 - (s.x ?? 0),
        height: s.height ?? 1 - (s.y ?? 0)
      })
      const size = Math.max(2, Math.round(width / (s.blocks ?? 24)))
      image.pixelate({ size, ...area })
      return
    }
    case "box": {
      const area = pixelRegion(image, s)
      const t = thickness(image)
      const c = parseColor(s.color)
      fillRect(image, area.x, area.y, area.w, t, c)
      fillRect(image, area.x, area.y + area.h - t, area.w, t, c)
      fillRect(image, area.x, area.y, t, area.h, c)
      fillRect(image, area.x + area.w - t, area.y, t, area.h, c)
      return
    }
    case "arrow": {
      const c = parseColor(s.color)
      const t = thickness(image)
      const [fromX = 0, fromY = 0] = s.from
      const [toX = 0, toY = 0] = s.to
      const [x1, y1, x2, y2] = [fromX * width, fromY * height, toX * width, toY * height]
      drawLine(image, x1, y1, x2, y2, t, c)
      // The head: two short strokes back from the tip, 28° either side of the shaft
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const head = Math.max(t * 5, Math.max(width, height) * 0.035)
      for (const side of [-1, 1]) {
        const a = angle + Math.PI + side * 0.49
        drawLine(image, x2, y2, x2 + head * Math.cos(a), y2 + head * Math.sin(a), t, c)
      }
      return
    }
  }
}

/** A fraction region as whole pixels inside the image, at least 1×1. */
function pixelRegion(image: Image, r: { x: number; y: number; width: number; height: number }) {
  const { width, height } = image.bitmap
  const x = Math.min(Math.floor(r.x * width), width - 1)
  const y = Math.min(Math.floor(r.y * height), height - 1)
  const w = Math.max(1, Math.min(Math.round(r.width * width), width - x))
  const h = Math.max(1, Math.min(Math.round(r.height * height), height - y))
  return { x, y, w, h }
}

// Lines that read at any size: about 1/300 of the longer side
function thickness(image: Image): number {
  return Math.max(2, Math.round(Math.max(image.bitmap.width, image.bitmap.height) / 300))
}

/** A colour name or #rrggbb as jimp's RGBA number; red when unset. */
export function parseColor(input: string | undefined): number {
  if (!input) return COLORS.red!
  const named = COLORS[input.toLowerCase()]
  if (named !== undefined) return named
  const hex = /^#?([0-9a-f]{6})$/i.exec(input)?.[1]
  if (!hex) throw new ToolError(NAME, `Unknown colour "${input}": use a name or #rrggbb.`)
  return (Number.parseInt(hex, 16) * 0x100 + 0xff) >>> 0
}

function fillRect(image: Image, x: number, y: number, w: number, h: number, color: number) {
  const { width, height } = image.bitmap
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(height, Math.ceil(y + h)); py++)
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(width, Math.ceil(x + w)); px++)
      image.setPixelColor(color, px, py)
}

// A thick line as squares stamped along it
function drawLine(image: Image, x1: number, y1: number, x2: number, y2: number, t: number, color: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)))
  for (let i = 0; i <= steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps
    const y = y1 + ((y2 - y1) * i) / steps
    fillRect(image, x - t / 2, y - t / 2, t, t, color)
  }
}
