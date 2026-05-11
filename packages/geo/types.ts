export interface GeoLocation {
  continent?: {
    geonameId: number
    name: string
  }
  country?: {
    geonameId: number
    name: string
  }
  city?: {
    geonameId: number
    name: string
  }
  location?: {
    accuracyRadius: number
    latitude: number
    longitude: number
    timeZone?: string
  }
}
