/** A URL's host as Kaja names a site: lowercased, without "www."; undefined when it isn't a URL. */
export function siteOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || undefined
  } catch {
    return undefined
  }
}

/** Where an image came from, as its row names it: a URL's site (the URL itself if it has none), else the file's name. */
export function sourceName(source: { url?: string; fileName?: string } | undefined): string | undefined {
  if (source?.url) return siteOf(source.url) ?? source.url
  return source?.fileName
}
