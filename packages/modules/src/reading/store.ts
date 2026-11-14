import { iso, pgText } from "@kaja/nasi"
import type { SQL } from "bun"
import { type Candidate, candidateOf, type Source } from "./sources"

/** `suggested`: found by Kaja, not looked at yet. `dismissed`: a suggestion the user turned down. */
export type ArticleStatus = "suggested" | "inbox" | "read" | "archived" | "dismissed"
/** Where an article came from: the user saved it, or the source Kaja found it at. */
export type ArticleSource = "saved" | Source["id"]
export type TopicState = "followed" | "neutral" | "muted"

/** An article without its text, as lists show it. */
export type ArticleSummary = {
  id: string
  number: number
  url: string
  title?: string
  site?: string
  author?: string
  wordCount: number
  /** Why the page couldn't be read; such an article has no content. */
  fetchError?: string
  note?: string
  status: ArticleStatus
  /** When it was saved, or found. */
  savedAt: string
  source: ArticleSource
  /** A found story's discussion page, and its points there when it was found. */
  discussionUrl?: string
  score?: number
  /** One line on what it says, written when it was tagged. */
  gist?: string
  /** Whether it ever got its topics (from the model or by hand). */
  tagged: boolean
  /** Its topics' names, in alphabetical order. */
  topics: string[]
}

export type Article = ArticleSummary & { content?: string }

/** What a save writes: the link, and the page as it was read (or why it wasn't). */
export type NewArticle = {
  url: string
  urlKey: string
  note?: string
  /** `read` for a link the user read at once: kept, but never in the inbox. `suggested` for a story Kaja found. */
  status: "inbox" | "read" | "suggested"
  /** Where Kaja found it; unset for a link the user saved. */
  found?: { source: Source["id"]; discussionUrl?: string; score: number }
  page: PageWrite
}

export type PageWrite = {
  title?: string
  site?: string
  author?: string
  content?: string
  wordCount: number
  fetchError?: string
}

/** One of the user's subjects, with how many of their articles carry it. */
export type Topic = {
  id: string
  name: string
  state: TopicState
  /** Kaja already offered to follow it. */
  offered: boolean
  /** Suggestions (and dismissed ones) don't count: only what the user saved or kept. */
  articles: number
  /** Of those, how many are still in the inbox. */
  inbox: number
}

type SummaryRow = {
  id: string
  number: number
  url: string
  title: string | null
  site: string | null
  author: string | null
  word_count: number
  fetch_error: string | null
  note: string | null
  status: ArticleStatus
  saved_at: Date | string
  source: ArticleSource
  discussion_url: string | null
  score: number | null
  gist: string | null
  tagged_at: Date | string | null
}

/** Two saves at once can pick the same number; the loser tries again with the next. */
const NUMBER_ATTEMPTS = 3
const STATE_ORDER: TopicState[] = ["followed", "neutral", "muted"]

const now = () => new Date().toISOString()

/** What makes two topic names the same topic: case, width and spacing aside. */
export function topicKey(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
}

function summaryOf(row: SummaryRow, topics: string[]): ArticleSummary {
  return {
    id: row.id,
    number: row.number,
    url: row.url,
    title: row.title ?? undefined,
    site: row.site ?? undefined,
    author: row.author ?? undefined,
    wordCount: row.word_count,
    fetchError: row.fetch_error ?? undefined,
    note: row.note ?? undefined,
    status: row.status,
    savedAt: iso(row.saved_at),
    source: row.source,
    discussionUrl: row.discussion_url ?? undefined,
    score: row.score ?? undefined,
    gist: row.gist ?? undefined,
    tagged: row.tagged_at !== null,
    topics
  }
}

/**
 * Deletes every account's suggestions found before `before` that nobody looked at, and the unfollowed topics that
 * leaves without an article.
 */
export async function expireSuggestions(sql: SQL, before: Date): Promise<void> {
  await sql.begin(async tx => {
    await tx`DELETE FROM reading_article WHERE status = 'suggested' AND saved_at < ${before.toISOString()}`
    await tx`
      DELETE FROM reading_topic
      WHERE state = 'neutral'
        AND NOT EXISTS (SELECT 1 FROM reading_article_topic l WHERE l.topic_id = reading_topic.id)`
  })
}

export type ReadingStore = ReturnType<typeof createReadingStore>

/**
 * One account's reading inbox and topics. Rows belong to the account, not to a channel's owner, so the web, Telegram
 * and the terminal share them. Writes go through `sql.begin`, as nasi's store does (see its SQLite note).
 */
export function createReadingStore(sql: SQL, userId: string) {
  // A summary's columns, for a query that calls the table `a`.
  const columns = (db: SQL) => db`
    a.id, a.number, a.url, a.title, a.site, a.author, a.word_count, a.fetch_error, a.note, a.status, a.saved_at,
    a.source, a.discussion_url, a.score, a.gist, a.tagged_at`

  // Topic names by article, for the articles numbered `from` to `to`.
  async function topicNames(db: SQL, from: number, to: number): Promise<Map<string, string[]>> {
    const rows = await db<{ article_id: string; name: string }[]>`
      SELECT l.article_id, t.name FROM reading_article_topic l
      JOIN reading_topic t ON t.id = l.topic_id
      JOIN reading_article a ON a.id = l.article_id
      WHERE a.user_id = ${userId} AND a.number >= ${from} AND a.number <= ${to}
      ORDER BY t.name`
    const names = new Map<string, string[]>()
    for (const row of rows) names.set(row.article_id, [...(names.get(row.article_id) ?? []), row.name])
    return names
  }

  async function summaries(db: SQL, rows: SummaryRow[]): Promise<ArticleSummary[]> {
    if (rows.length === 0) return []
    const numbers = rows.map(row => row.number)
    const names = await topicNames(db, Math.min(...numbers), Math.max(...numbers))
    return rows.map(row => summaryOf(row, names.get(row.id) ?? []))
  }

  async function byKey(db: SQL, key: string): Promise<ArticleSummary | undefined> {
    const rows = await db<SummaryRow[]>`
      SELECT ${columns(db)} FROM reading_article a WHERE a.user_id = ${userId} AND a.url_key = ${key}`
    return (await summaries(db, rows))[0]
  }

  async function insert(article: NewArticle): Promise<ArticleSummary> {
    const { page, found } = article
    const at = now()
    return sql.begin(async tx => {
      // The next number is read and written in one statement; a link saved meanwhile keeps its own row.
      await tx`
        INSERT INTO reading_article (id, user_id, number, url, url_key, title, site, author, content, word_count,
                                     fetch_error, source, discussion_url, score, note, status, saved_at, read_at)
        SELECT ${Bun.randomUUIDv7()}, ${userId}, COALESCE(MAX(number), 0) + 1, ${pgText(article.url)},
               ${pgText(article.urlKey)}, ${pgText(page.title)}, ${pgText(page.site)}, ${pgText(page.author)},
               ${pgText(page.content)}, ${page.wordCount}, ${pgText(page.fetchError)}, ${found?.source ?? "saved"},
               ${pgText(found?.discussionUrl)}, ${found?.score ?? null}, ${pgText(article.note)}, ${article.status},
               ${at}, ${article.status === "read" ? at : null}
        FROM reading_article WHERE user_id = ${userId}
        ON CONFLICT (user_id, url_key) DO NOTHING`
      return (await byKey(tx, article.urlKey))!
    })
  }

  async function topics(db: SQL = sql): Promise<Topic[]> {
    const rows = await db<
      {
        id: string
        name: string
        state: TopicState
        offered_at: Date | string | null
        articles: number | string
        inbox: number | string
      }[]
    >`
      SELECT t.id, t.name, t.state, t.offered_at,
             COALESCE(SUM(CASE WHEN a.status IN ('inbox', 'read', 'archived') THEN 1 ELSE 0 END), 0) AS articles,
             COALESCE(SUM(CASE WHEN a.status = 'inbox' THEN 1 ELSE 0 END), 0) AS inbox
      FROM reading_topic t
      LEFT JOIN reading_article_topic l ON l.topic_id = t.id
      LEFT JOIN reading_article a ON a.id = l.article_id
      WHERE t.user_id = ${userId}
      GROUP BY t.id, t.name, t.state, t.offered_at`
    return rows
      .map(row => ({
        id: row.id,
        name: row.name,
        state: row.state,
        offered: row.offered_at !== null,
        articles: Number(row.articles),
        inbox: Number(row.inbox)
      }))
      .sort(
        (a, b) =>
          STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
          b.articles - a.articles ||
          a.name.localeCompare(b.name)
      )
  }

  return {
    /** The article saved from a link with this key (see `urlKey`), if any. */
    findByKey: (key: string) => byKey(sql, key),

    /** Saves a link under the account's next number; one already saved (by key) is returned as it is. */
    async add(article: NewArticle): Promise<ArticleSummary> {
      for (let attempt = 1; ; attempt++) {
        try {
          return await insert(article)
        } catch (error) {
          if (attempt >= NUMBER_ATTEMPTS) throw error
        }
      }
    },

    /** Replaces what was read of an article's page (a link whose first read failed, read again). */
    async setPage(number: number, page: PageWrite): Promise<void> {
      await sql.begin(
        tx => tx`
          UPDATE reading_article
          SET title = ${pgText(page.title)}, site = ${pgText(page.site)}, author = ${pgText(page.author)},
              content = ${pgText(page.content)}, word_count = ${page.wordCount},
              fetch_error = ${pgText(page.fetchError)}
          WHERE user_id = ${userId} AND number = ${number}`
      )
    },

    /**
     * One page of articles, newest first, with how many there are in all: of a status, or `all` the user saved or kept
     * (suggestions and dismissed ones aside); of a topic, or any.
     */
    async list(opts: {
      status: ArticleStatus | "all"
      topicId?: string
      limit: number
      offset: number
    }): Promise<{ articles: ArticleSummary[]; total: number }> {
      const kept = opts.status === "all"
      const anyTopic = opts.topicId === undefined
      const topicId = opts.topicId ?? null
      const matching = sql`
        a.user_id = ${userId}
        AND ((${kept} AND a.status IN ('inbox', 'read', 'archived')) OR a.status = ${opts.status})
        AND (${anyTopic} OR EXISTS (
          SELECT 1 FROM reading_article_topic l WHERE l.article_id = a.id AND l.topic_id = ${topicId}))`
      const rows = await sql<SummaryRow[]>`
        SELECT ${columns(sql)} FROM reading_article a WHERE ${matching}
        ORDER BY a.number DESC LIMIT ${opts.limit} OFFSET ${opts.offset}`
      const [count] = await sql<{ n: number | string }[]>`SELECT COUNT(*) AS n FROM reading_article a WHERE ${matching}`
      return { articles: await summaries(sql, rows), total: Number(count?.n ?? 0) }
    },

    /** How many suggestions wait to be looked at. */
    async suggestedCount(): Promise<number> {
      const [count] = await sql<{ n: number | string }[]>`
        SELECT COUNT(*) AS n FROM reading_article WHERE user_id = ${userId} AND status = 'suggested'`
      return Number(count?.n ?? 0)
    },

    /** How many stories Kaja found for the account since `since`, whatever became of them. */
    async foundSince(since: Date): Promise<number> {
      const [count] = await sql<{ n: number | string }[]>`
        SELECT COUNT(*) AS n FROM reading_article
        WHERE user_id = ${userId} AND source <> 'saved' AND saved_at >= ${since.toISOString()}`
      return Number(count?.n ?? 0)
    },

    /**
     * The sources' stories first seen after `since` (all of them when unset) that the account doesn't have yet, the
     * most popular first.
     */
    async candidates(since: string | undefined, limit: number): Promise<Candidate[]> {
      const all = since === undefined
      const rows = await sql<Parameters<typeof candidateOf>[0][]>`
        SELECT i.source, i.external_id, i.title, i.url, i.url_key, i.discussion_url, i.score, i.comments, i.published_at
        FROM reading_source_item i
        WHERE (${all} OR i.first_seen_at > ${since ?? null})
          AND NOT EXISTS (SELECT 1 FROM reading_article a WHERE a.user_id = ${userId} AND a.url_key = i.url_key)
        ORDER BY i.score DESC, i.external_id LIMIT ${limit}`
      return rows.map(candidateOf)
    },

    /** An article with its text, noting the first time it's opened. */
    async open(number: number): Promise<Article | undefined> {
      const at = now()
      let article: Article | undefined
      await sql.begin(async tx => {
        const rows = await tx<(SummaryRow & { content: string | null })[]>`
          SELECT ${columns(tx)}, a.content FROM reading_article a WHERE a.user_id = ${userId} AND a.number = ${number}`
        const [summary] = await summaries(tx, rows)
        if (!summary) return
        await tx`
          UPDATE reading_article SET opened_at = ${at}
          WHERE user_id = ${userId} AND number = ${number} AND opened_at IS NULL`
        article = { ...summary, content: rows[0]!.content ?? undefined }
      })
      return article
    },

    /** An article's stored text, without counting as opening it. */
    async text(number: number): Promise<string | undefined> {
      const [row] = await sql<{ content: string | null }[]>`
        SELECT content FROM reading_article WHERE user_id = ${userId} AND number = ${number}`
      return row?.content ?? undefined
    },

    /**
     * Moves an article to a status, stamping when it was first read or archived; with `from`, only an article in that
     * status. False when no article was moved.
     */
    async setStatus(number: number, status: ArticleStatus, from?: ArticleStatus): Promise<boolean> {
      const at = now()
      const fromAny = from === undefined
      const result = await sql.begin(
        tx => tx`
          UPDATE reading_article
          SET status = ${status}, read_at = COALESCE(read_at, ${status === "read" ? at : null}),
              archived_at = COALESCE(archived_at, ${status === "archived" ? at : null})
          WHERE user_id = ${userId} AND number = ${number} AND (${fromAny} OR status = ${from ?? null})`
      )
      return result.affectedRows > 0
    },

    /** The account's topics: followed first, then by how many articles carry them. */
    topics: () => topics(),

    /**
     * Gives an article exactly these topics (new names become unfollowed topics) and, with `gist`, its one line. An
     * unfollowed topic left without articles goes. `tagged: false` leaves the article to be tagged later (a found
     * story whose page hasn't been read). Returns the article's topics, or undefined when there's no such article.
     */
    async setArticleTopics(
      number: number,
      names: string[],
      opts: { gist?: string; tagged?: boolean } = {}
    ): Promise<Topic[] | undefined> {
      const at = now()
      const keys = new Set(names.map(topicKey))
      let found = false
      await sql.begin(async tx => {
        const [article] = await tx<{ id: string }[]>`
          SELECT id FROM reading_article WHERE user_id = ${userId} AND number = ${number}`
        if (!article) return
        found = true
        await tx`DELETE FROM reading_article_topic WHERE article_id = ${article.id}`
        for (const name of names) {
          const key = topicKey(name)
          await tx`
            INSERT INTO reading_topic (id, user_id, name, name_key, state, created_at)
            VALUES (${Bun.randomUUIDv7()}, ${userId}, ${pgText(name.trim())}, ${pgText(key)}, 'neutral', ${at})
            ON CONFLICT (user_id, name_key) DO NOTHING`
          await tx`
            INSERT INTO reading_article_topic (article_id, topic_id)
            SELECT ${article.id}, id FROM reading_topic WHERE user_id = ${userId} AND name_key = ${pgText(key)}
            ON CONFLICT (article_id, topic_id) DO NOTHING`
        }
        if (opts.tagged !== false)
          await tx`
            UPDATE reading_article SET tagged_at = ${at}, gist = COALESCE(${pgText(opts.gist)}, gist)
            WHERE id = ${article.id}`
        await tx`
          DELETE FROM reading_topic
          WHERE user_id = ${userId} AND state = 'neutral'
            AND NOT EXISTS (SELECT 1 FROM reading_article_topic l WHERE l.topic_id = reading_topic.id)`
      })
      return found ? (await topics()).filter(topic => keys.has(topicKey(topic.name))) : undefined
    },

    /** Notes that Kaja offered to follow a topic (or the user decided about it), so it doesn't ask again. */
    async markOffered(topicId: string): Promise<void> {
      await sql.begin(
        tx => tx`UPDATE reading_topic SET offered_at = ${now()} WHERE user_id = ${userId} AND id = ${topicId}`
      )
    },

    /** Renames a topic and/or changes whether it's followed. The caller checks the new name is free. */
    async updateTopic(topicId: string, change: { name?: string; state?: TopicState }): Promise<void> {
      await sql.begin(async tx => {
        if (change.name !== undefined)
          await tx`
            UPDATE reading_topic SET name = ${pgText(change.name.trim())}, name_key = ${pgText(topicKey(change.name))}
            WHERE user_id = ${userId} AND id = ${topicId}`
        if (change.state !== undefined)
          await tx`UPDATE reading_topic SET state = ${change.state} WHERE user_id = ${userId} AND id = ${topicId}`
      })
    },

    /** Moves every article of one topic to another and removes the first. */
    async mergeTopics(fromId: string, intoId: string): Promise<void> {
      await sql.begin(async tx => {
        await tx`
          INSERT INTO reading_article_topic (article_id, topic_id)
          SELECT l.article_id, t.id FROM reading_article_topic l
          JOIN reading_topic t ON t.id = ${intoId} AND t.user_id = ${userId}
          WHERE l.topic_id = ${fromId}
          ON CONFLICT (article_id, topic_id) DO NOTHING`
        await tx`DELETE FROM reading_topic WHERE user_id = ${userId} AND id = ${fromId}`
      })
    }
  }
}
