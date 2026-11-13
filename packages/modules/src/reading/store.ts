import { iso, pgText } from "@kaja/nasi"
import type { SQL } from "bun"

export type ArticleStatus = "inbox" | "read" | "archived"

/** A saved link without its text, as lists show it. */
export type ArticleSummary = {
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
  savedAt: string
}

export type Article = ArticleSummary & { content?: string }

/** What a save writes: the link, and the page as it was read (or why it wasn't). */
export type NewArticle = {
  url: string
  urlKey: string
  note?: string
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

type SummaryRow = {
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
}

/** Two saves at once can pick the same number; the loser tries again with the next. */
const NUMBER_ATTEMPTS = 3

const now = () => new Date().toISOString()

function summaryOf(row: SummaryRow): ArticleSummary {
  return {
    number: row.number,
    url: row.url,
    title: row.title ?? undefined,
    site: row.site ?? undefined,
    author: row.author ?? undefined,
    wordCount: row.word_count,
    fetchError: row.fetch_error ?? undefined,
    note: row.note ?? undefined,
    status: row.status,
    savedAt: iso(row.saved_at)
  }
}

export type ReadingStore = ReturnType<typeof createReadingStore>

/**
 * One account's reading inbox. Rows belong to the account, not to a channel's owner, so the web, Telegram and the
 * terminal share them. Writes go through `sql.begin`, as nasi's store does (see its SQLite note).
 */
export function createReadingStore(sql: SQL, userId: string) {
  async function byKey(db: SQL, key: string): Promise<ArticleSummary | undefined> {
    const [row] = await db<SummaryRow[]>`
      SELECT number, url, title, site, author, word_count, fetch_error, note, status, saved_at
      FROM reading_article WHERE user_id = ${userId} AND url_key = ${key}`
    return row && summaryOf(row)
  }

  async function insert(article: NewArticle): Promise<ArticleSummary> {
    const { page } = article
    return sql.begin(async tx => {
      // The next number is read and written in one statement; a link saved meanwhile keeps its own row.
      await tx`
        INSERT INTO reading_article (id, user_id, number, url, url_key, title, site, author, content, word_count,
                                     fetch_error, source, note, status, saved_at)
        SELECT ${Bun.randomUUIDv7()}, ${userId}, COALESCE(MAX(number), 0) + 1, ${pgText(article.url)},
               ${pgText(article.urlKey)}, ${pgText(page.title)}, ${pgText(page.site)}, ${pgText(page.author)},
               ${pgText(page.content)}, ${page.wordCount}, ${pgText(page.fetchError)}, 'saved',
               ${pgText(article.note)}, 'inbox', ${now()}
        FROM reading_article WHERE user_id = ${userId}
        ON CONFLICT (user_id, url_key) DO NOTHING`
      return (await byKey(tx, article.urlKey))!
    })
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

    /** One page of a status's articles, newest first, with how many there are in all. */
    async list(opts: {
      status: ArticleStatus
      limit: number
      offset: number
    }): Promise<{ articles: ArticleSummary[]; total: number }> {
      const rows = await sql<SummaryRow[]>`
        SELECT number, url, title, site, author, word_count, fetch_error, note, status, saved_at
        FROM reading_article WHERE user_id = ${userId} AND status = ${opts.status}
        ORDER BY number DESC LIMIT ${opts.limit} OFFSET ${opts.offset}`
      const [count] = await sql<{ n: number | string }[]>`
        SELECT COUNT(*) AS n FROM reading_article WHERE user_id = ${userId} AND status = ${opts.status}`
      return { articles: rows.map(summaryOf), total: Number(count?.n ?? 0) }
    },

    /** An article with its text, noting the first time it's opened. */
    async open(number: number): Promise<Article | undefined> {
      return sql.begin(async tx => {
        const [row] = await tx<(SummaryRow & { content: string | null })[]>`
          SELECT number, url, title, site, author, word_count, fetch_error, note, status, saved_at, content
          FROM reading_article WHERE user_id = ${userId} AND number = ${number}`
        if (!row) return undefined
        await tx`
          UPDATE reading_article SET opened_at = ${now()}
          WHERE user_id = ${userId} AND number = ${number} AND opened_at IS NULL`
        return { ...summaryOf(row), content: row.content ?? undefined }
      })
    },

    /** Moves an article to a status, stamping when it was first read or archived; false when there's no such article. */
    async setStatus(number: number, status: ArticleStatus): Promise<boolean> {
      const at = now()
      const result = await sql.begin(
        tx => tx`
          UPDATE reading_article
          SET status = ${status}, read_at = COALESCE(read_at, ${status === "read" ? at : null}),
              archived_at = COALESCE(archived_at, ${status === "archived" ? at : null})
          WHERE user_id = ${userId} AND number = ${number}`
      )
      return result.affectedRows > 0
    }
  }
}
