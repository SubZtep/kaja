import { z } from "zod"

/** Reusable schema for continent, country, and city */
const GeoPlaceSchema = z.object({
  geonameId: z.number(),
  name: z.string()
})

/** Reusable schema for the location details */
const LocationDetailsSchema = z.object({
  accuracyRadius: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  timeZone: z.string().optional()
})

/** Main GeoLocation schema */
export const GeoLocationSchema = z.object({
  continent: GeoPlaceSchema.optional(),
  country: GeoPlaceSchema.optional(),
  city: GeoPlaceSchema.optional(),
  location: LocationDetailsSchema.optional()
})

export type GeoLocation = z.infer<typeof GeoLocationSchema>
