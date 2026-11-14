import { z } from "zod"
import type { Source, SourceItem } from "./sources"

const HOST = "hn.algolia.com"
/** A story with fewer points hasn't interested enough people yet. */
export const MIN_POINTS = 50
const MAX_STORIES = 100

const HitSchema = z.object({
  objectID: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  points: z.number().nullish(),
  num_comments: z.number().nullish(),
  created_at_i: z.number()
})
const ReplySchema = z.object({ hits: z.array(z.unknown()) })

/** The stories in a search reply; one without a link (Ask HN, a text post) or in a shape we don't know is left out. */
export function parseHackerNews(reply: unknown): SourceItem[] {
  const parsed = ReplySchema.safeParse(reply)
  if (!parsed.success) throw new Error("Hacker News answered in a shape we don't know")
  return parsed.data.hits.flatMap(raw => {
    const hit = HitSchema.safeParse(raw)
    if (!hit.success || !hit.data.title || !hit.data.url) return []
    return {
      externalId: hit.data.objectID,
      title: hit.data.title.trim(),
      url: hit.data.url,
      discussionUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.data.objectID)}`,
      score: Math.round(hit.data.points ?? 0),
      comments: Math.round(hit.data.num_comments ?? 0),
      publishedAt: new Date(hit.data.created_at_i * 1000).toISOString()
    }
  })
}

/** Hacker News through its search API: one request for the recent stories with enough points. */
export const hackerNews: Source = {
  id: "hn",
  name: "Hacker News",
  hosts: [HOST],
  async fetch(send, since) {
    const query = new URLSearchParams({
      tags: "story",
      numericFilters: `created_at_i>${Math.floor(since.getTime() / 1000)},points>=${MIN_POINTS}`,
      hitsPerPage: String(MAX_STORIES),
      attributesToRetrieve: "title,url,points,num_comments,created_at_i"
    })
    const response = await send(`https://${HOST}/api/v1/search?${query}`, { headers: { accept: "application/json" } })
    if (!response.ok) throw new Error(`Hacker News answered ${response.status}`)
    return parseHackerNews(await response.json())
  }
}
