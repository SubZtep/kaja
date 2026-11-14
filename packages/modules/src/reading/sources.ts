import { type FetchLike, iso, pgText } from "@kaja/nasi"
import type { SQL } from "bun"
import { urlKey } from "./url"

/** A story as a source lists it. */
export type SourceItem = {
  /** The source's own id for it. */
  externalId: string
  title: string
  url: string
  /** Where the source's readers talk about it. */
  discussionUrl?: string
  /** The source's own measure of interest (Hacker News: points). */
  score: number
  comments: number
  publishedAt: string
}

/** Somewhere stories come from. Its list is fetched once for everyone; each account's search picks from it. */
export type Source = {
  /** Also `reading_article.source` for a story found there. */
  id: "hn"
  name: string
  /** The only hosts `fetch` talks to: the list is fetched from this host, not through a sandbox. */
  hosts: string[]
  /** The stories published since `since` that are worth offering. */
  fetch(send: FetchLike, since: Date): Promise<SourceItem[]>
}

/** A listed story as an account's search sees it. */
export type Candidate = SourceItem & { source: Source["id"]; urlKey: string }

type ItemRow = {
  source: Source["id"]
  external_id: string
  title: string
  url: string
  url_key: string
  discussion_url: string | null
  score: number
  comments: number
  published_at: Date | string
}

/** A `reading_source_item` row as a candidate. */
export function candidateOf(row: ItemRow): Candidate {
  return {
    source: row.source,
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    urlKey: row.url_key,
    discussionUrl: row.discussion_url ?? undefined,
    score: row.score,
    comments: row.comments,
    publishedAt: iso(row.published_at)
  }
}

/** Keeps a source's list: a new story is first seen at `at`, a known one only gets its numbers refreshed. */
export async function keepSourceItems(sql: SQL, source: Source["id"], items: SourceItem[], at: Date): Promise<void> {
  await sql.begin(async tx => {
    for (const item of items) {
      const key = urlKey(item.url)
      if (!key) continue
      await tx`
        INSERT INTO reading_source_item (id, source, external_id, title, url, url_key, discussion_url, score, comments,
                                         published_at, first_seen_at)
        VALUES (${Bun.randomUUIDv7()}, ${source}, ${pgText(item.externalId)}, ${pgText(item.title)},
                ${pgText(item.url)}, ${pgText(key)}, ${pgText(item.discussionUrl)}, ${item.score}, ${item.comments},
                ${item.publishedAt}, ${at.toISOString()})
        ON CONFLICT (source, external_id) DO UPDATE
        SET title = EXCLUDED.title, score = EXCLUDED.score, comments = EXCLUDED.comments`
    }
  })
}

/** Forgets the stories first seen before `before`. */
export async function pruneSourceItems(sql: SQL, before: Date): Promise<void> {
  await sql.begin(tx => tx`DELETE FROM reading_source_item WHERE first_seen_at < ${before.toISOString()}`)
}
