import { readArticle, type Tool, tool, ToolError } from "@kaja/nasi"
import { z } from "zod"
import type { ModuleContext } from "../contract"
import { type ArticleSummary, createReadingStore, type PageWrite } from "./store"
import { urlKey } from "./url"

/** What's kept of a page's text; a longer one is cut there (its word count still covers all of it). */
export const MAX_CONTENT_CHARS = 200_000
const WORDS_PER_MINUTE = 230
const STATUSES = ["inbox", "read", "archived"] as const

const SAVE = "save_article"
const LIST = "list_articles"
const READ = "read_article"
const MARK = "mark_article"

const numberArg = z.int().min(1).describe("The article's number, as save_article and list_articles show it (#3 is 3)")

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "")
}

function nameOf(article: ArticleSummary): string {
  return article.title ?? article.url
}

function minutes(words: number): string {
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min`
}

// One list line: "#3 Title — site, saved 2026-11-13, 8 min"
function line(article: ArticleSummary): string {
  const read = article.fetchError ? "page couldn't be read" : minutes(article.wordCount)
  const site = article.site ?? hostOf(article.url)
  return `#${article.number} ${nameOf(article)} — ${site}, saved ${article.savedAt.slice(0, 10)}, ${read}`
}

// The page behind a link as the store keeps it; a page that can't be read is kept as the reason why.
async function readPage(url: string, send: ModuleContext["send"]): Promise<PageWrite> {
  try {
    const page = await readArticle(url, { send })
    const words = page.markdown.split(/\s+/).filter(Boolean).length
    return {
      title: page.title,
      site: page.siteName ?? hostOf(url),
      author: page.byline,
      content: page.markdown.slice(0, MAX_CONTENT_CHARS),
      wordCount: words
    }
  } catch (error) {
    return { site: hostOf(url), wordCount: 0, fetchError: error instanceof Error ? error.message : String(error) }
  }
}

/** The reading inbox's agent tools for one account. */
export function readingTools(ctx: ModuleContext): Tool[] {
  const store = createReadingStore(ctx.sql, ctx.userId)

  const saveArticle = tool({
    name: SAVE,
    description:
      "Save a link to the user's reading inbox, to read later: the page is fetched and its text kept. Use it when " +
      "the user asks to save, keep or read something later. Saving a link that's already there doesn't duplicate it.",
    schema: z.object({
      url: z.string().describe("The link to save"),
      note: z.string().optional().describe("Why the user saved it, in their words, only if they said")
    }),
    execute: async args => {
      const url = args.url.trim()
      const key = urlKey(url)
      if (!key) throw new ToolError(SAVE, `Not a web link: ${url}`)
      const existing = await store.findByKey(key)
      if (existing && !existing.fetchError) {
        if (existing.status === "inbox") return `Already in the inbox as #${existing.number}: ${nameOf(existing)}`
        await store.setStatus(existing.number, "inbox")
        return `Already saved as #${existing.number} (${existing.status}), now back in the inbox: ${nameOf(existing)}`
      }
      const page = await readPage(url, ctx.send)
      // A link whose page couldn't be read before gets another try.
      if (existing) {
        if (page.fetchError)
          return `Already saved as #${existing.number}; its page still can't be read (${page.fetchError}).`
        await store.setPage(existing.number, page)
        return `#${existing.number} was saved without its page; it's read now: ${page.title ?? url} (${minutes(page.wordCount)}).`
      }
      const saved = await store.add({ url, urlKey: key, note: args.note, page })
      if (saved.fetchError)
        return `Saved the link as #${saved.number}, but its page couldn't be read (${saved.fetchError}). Saving it again tries once more.`
      return `Saved as #${saved.number}: ${nameOf(saved)} (${saved.site}, ${minutes(saved.wordCount)}).`
    }
  })

  const listArticles = tool({
    name: LIST,
    description:
      "List the user's saved articles, newest first: the inbox (still to read) unless another status is asked for. " +
      "Each line has the article's number, which the other reading tools take.",
    schema: z.object({
      status: z.enum(STATUSES).default("inbox").describe("inbox (to read), read, or archived"),
      limit: z.int().min(1).max(50).default(10),
      offset: z.int().min(0).default(0).describe("How many to skip, for the next page")
    }),
    execute: async args => {
      const { articles, total } = await store.list(args)
      if (total === 0) return args.status === "inbox" ? "The reading inbox is empty." : `No ${args.status} articles.`
      if (articles.length === 0) return `Nothing past ${total} ${args.status} articles.`
      const range = `${args.offset + 1}-${args.offset + articles.length} of ${total}`
      return [`${args.status}: ${range}, newest first`, ...articles.map(line)].join("\n")
    }
  })

  const readArticleTool = tool({
    name: READ,
    description:
      "Get a saved article's text as it was when saved, to read it to the user, summarise it or answer questions " +
      "about it. No request is made, so it works when the page is gone.",
    schema: z.object({ number: numberArg }),
    execute: async args => {
      const article = await store.open(args.number)
      if (!article) throw new ToolError(READ, `There is no article #${args.number}.`)
      if (article.content === undefined)
        return `#${article.number} (${article.url}) was saved, but its page couldn't be read: ${article.fetchError}. Saving the link again tries once more.`
      const about = [article.url, article.site, article.author, `status: ${article.status}`].filter(Boolean).join(" · ")
      const note = article.note ? `\nThe user's note: ${article.note}` : ""
      return `# ${nameOf(article)}\n${about}${note}\n\n${article.content}`
    }
  })

  const markArticle = tool({
    name: MARK,
    description:
      "Move a saved article: read once the user has finished it, archived when they don't want it in the inbox " +
      "any more (nothing is deleted), inbox to bring it back.",
    schema: z.object({ number: numberArg, status: z.enum(STATUSES) }),
    execute: async args => {
      if (!(await store.setStatus(args.number, args.status)))
        throw new ToolError(MARK, `There is no article #${args.number}.`)
      return args.status === "inbox" ? `#${args.number} is back in the inbox.` : `#${args.number} is ${args.status}.`
    }
  })

  return [saveArticle, listArticles, readArticleTool, markArticle]
}
