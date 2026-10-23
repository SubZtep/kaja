import { z } from "zod"
import { statsChannelSchema } from "./stats"

/** Where an image came from, as its arrivals knew: a URL, the HTML alt and title, a file's name. */
export const imageSourceSchema = z.object({
  url: z.string().optional(),
  alt: z.string().optional(),
  title: z.string().optional(),
  fileName: z.string().optional()
})

/** One stored image as the admin images page shows it; `session` is null for a new session not saved yet. */
export const adminImageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  session: z.object({ title: z.string(), channel: statsChannelSchema }).nullable(),
  user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  /** The image's public URL. */
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
  source: imageSourceSchema,
  description: z.string().nullable(),
  descriptionModel: z.string().nullable(),
  describedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date()
})

/** Where an image came from: a URL, a file (by name), or neither (a tool's or a photo without either). */
export const imageOriginSchema = z.enum(["url", "file", "none"])

/** The admin images page's filters, all combined; `cursor` is the previous page's `next`. */
export const adminImagesQuerySchema = z.object({
  user: z.uuid().optional(),
  site: z.string().trim().toLowerCase().min(1).max(253).optional(),
  undescribed: z.stringbool().optional(),
  origin: imageOriginSchema.optional(),
  cursor: z.string().max(256).optional()
})

/** Newest first; `next` fetches the page after this one, null on the last. */
export const adminImagesResponseSchema = z.object({
  images: z.array(adminImageSchema),
  next: z.string().nullable()
})

/** What "describe all matching" covers: the images page's filters (only undescribed images are ever picked). */
export const describeImagesRequestSchema = z.object({
  user: z.uuid().optional(),
  site: z.string().trim().toLowerCase().min(1).max(253).optional(),
  origin: imageOriginSchema.optional()
})

/** The description the vision model wrote, or null when it gave none. */
export const describeImageResponseSchema = z.object({ description: z.string().nullable() })

/** How many images were queued for describing in the background. */
export const describeImagesResponseSchema = z.object({ queued: z.number().int() })

/**
 * Orphan kinds: objects in the bucket with no row, rows whose object is gone, and images of sessions that were never
 * saved (older than a day).
 */
export const imageOrphanKindSchema = z.enum(["objects", "rows", "unsaved"])

const orphansOfKindSchema = z.object({
  count: z.number().int(),
  bytes: z.number().int(),
  /** Up to 50 object keys. */
  examples: z.array(z.string())
})

export const imageOrphansResponseSchema = z.object({
  objects: orphansOfKindSchema,
  rows: orphansOfKindSchema,
  unsaved: orphansOfKindSchema
})

export const removeOrphansResponseSchema = z.object({ removed: z.number().int() })

export type AdminImage = z.infer<typeof adminImageSchema>
export type AdminImagesQuery = z.infer<typeof adminImagesQuerySchema>
export type AdminImagesResponse = z.infer<typeof adminImagesResponseSchema>
export type ImageOrigin = z.infer<typeof imageOriginSchema>
export type DescribeImagesRequest = z.infer<typeof describeImagesRequestSchema>
export type ImageOrphanKind = z.infer<typeof imageOrphanKindSchema>
export type ImageOrphansResponse = z.infer<typeof imageOrphansResponseSchema>
