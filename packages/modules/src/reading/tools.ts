import { readArticle, type Tool, tool, type ToolContext, ToolError } from "@kaja/nasi"
import { z } from "zod"
import type { ModuleContext } from "../contract"
import { moduleSettings } from "../core/settings"
import { READING_ID } from "./manifest"
import { BARE_LINK_CHOICES, ReadingSettingsSchema } from "./settings"
import { type Article, type ArticleSummary, createReadingStore, type PageWrite, type Topic, topicKey } from "./store"
import { assignTopics, MAX_TOPICS } from "./tagging"
import { urlKey } from "./url"

/** What's kept of a page's text; a longer one is cut there (its word count still covers all of it). */
export const MAX_CONTENT_CHARS = 200_000
/** A topic with this many saved articles is one Kaja offers to follow. */
export const FOLLOW_OFFER_AT = 3
const WORDS_PER_MINUTE = 230
const STATUSES = ["inbox", "read", "archived"] as const
const TOPIC_STATES = ["followed", "neutral", "muted"] as const

const SAVE = "save_article"
const LIST = "list_articles"
const READ = "read_article"
const MARK = "mark_article"
const TOPICS = "list_topics"
const TOPIC = "update_topic"
/** The tool a message that is only a link goes to; the module's prompt section is tied to it. */
export const LINK = "link_received"
const LINK_PREFERENCE = "set_link_preference"

const ASK_ABOUT_LINKS =
  "The user hasn't said yet what a link sent on its own should do. Ask them once with ask_user (\"Save it for " +
  'later, or read it now?", options "Save for later" and "Read it now"), then call link_received again with the ' +
  'same url and choice "save" or "read". Their choice is remembered for later links.'

type OnModelCall = ToolContext["onModelCall"]

const numberArg = z.int().min(1).describe("The article's number, as save_article and list_articles show it (#3 is 3)")

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "")
}

function nameOf(article: Pick<ArticleSummary, "title" | "url">): string {
  return article.title ?? article.url
}

function minutes(words: number): string {
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min`
}

// One list line: "#3 Title — site, saved 2026-11-13, 8 min · AI agents, Rust"
function line(article: ArticleSummary, withStatus: boolean): string {
  const read = article.fetchError ? "page couldn't be read" : minutes(article.wordCount)
  const site = article.site ?? hostOf(article.url)
  const status = withStatus ? `, ${article.status}` : ""
  const topics = article.topics.length > 0 ? ` · ${article.topics.join(", ")}` : ""
  return `#${article.number} ${nameOf(article)} — ${site}, saved ${article.savedAt.slice(0, 10)}, ${read}${status}${topics}`
}

// An article as the model reads it: what's known about it, then its text.
function articleText(article: Article): string {
  const about = [article.url, article.site, article.author, `status: ${article.status}`].filter(Boolean).join(" · ")
  const lines = [
    `# ${nameOf(article)}`,
    about,
    article.topics.length > 0 ? `Topics: ${article.topics.join(", ")}` : undefined,
    article.note ? `The user's note: ${article.note}` : undefined
  ].filter(Boolean)
  return `${lines.join("\n")}\n\n${article.content}`
}

// "AI agents — followed, 5 articles (2 in the inbox)"
function topicLine(topic: Topic): string {
  const state = topic.state === "neutral" ? "" : `${topic.state}, `
  const inbox = topic.inbox > 0 ? ` (${topic.inbox} in the inbox)` : ""
  return `${topic.name} — ${state}${topic.articles} ${topic.articles === 1 ? "article" : "articles"}${inbox}`
}

// A topic name as it's stored: single spaces, a sane length.
function cleanTopic(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40).trim()
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
  const settings = moduleSettings(ctx, READING_ID, ReadingSettingsSchema)

  // Gives an article its topics and gist; returns what to add to the tool's result (the topics, and once per topic the offer to follow it), nothing when it couldn't be tagged.
  async function tag(
    article: Pick<ArticleSummary, "number" | "title" | "site">,
    content: string,
    onCall: OnModelCall
  ): Promise<string> {
    const known = (await store.topics()).toSorted((a, b) => b.articles - a.articles).map(topic => topic.name)
    const tagging = await assignTopics(ctx, { title: article.title, site: article.site, content }, known, onCall)
    const topics = tagging && (await store.setArticleTopics(article.number, tagging.topics, tagging.gist))
    if (!tagging || !topics) return ""
    const lines = [`Topics: ${topics.map(topic => topic.name).join(", ")}.`]
    if (tagging.gist) lines.push(`Gist: ${tagging.gist}`)
    const recurring = topics.find(
      topic => topic.state === "neutral" && !topic.offered && topic.articles >= FOLLOW_OFFER_AT
    )
    if (recurring) {
      await store.markOffered(recurring.id)
      lines.push(
        `"${recurring.name}" now has ${recurring.articles} saved articles and isn't followed. Ask the user once, with ` +
          'ask_user and the options "Follow" and "Not now", whether to follow it as a standing interest; on ' +
          `"Follow" call ${TOPIC} with state "followed".`
      )
    }
    return `\n${lines.join("\n")}`
  }

  // What a result says of an article that has its topics; one that never got them is tagged now.
  async function topicsOf(article: ArticleSummary, onCall: OnModelCall): Promise<string> {
    if (article.tagged) return article.topics.length > 0 ? `\nTopics: ${article.topics.join(", ")}.` : ""
    const content = await store.text(article.number)
    return content ? tag(article, content, onCall) : ""
  }

  // Saves a link (or finds it already saved) for the inbox, or as read for a link the user reads at once; returns its number and what to tell the model.
  async function saveLink(
    toolName: string,
    rawUrl: string,
    opts: { note?: string; status: "inbox" | "read" },
    onCall: OnModelCall
  ): Promise<{ number: number; message: string }> {
    const url = rawUrl.trim()
    const key = urlKey(url)
    if (!key) throw new ToolError(toolName, `Not a web link: ${url}`)
    const asRead = opts.status === "read"
    const existing = await store.findByKey(key)
    if (existing && !existing.fetchError) {
      const { number } = existing
      let message: string
      if (existing.status === opts.status)
        message = asRead
          ? `Already kept as #${number} (read): ${nameOf(existing)}`
          : `Already in the inbox as #${number}: ${nameOf(existing)}`
      else {
        await store.setStatus(number, opts.status)
        message = asRead
          ? `Already saved as #${number}, now marked read: ${nameOf(existing)}`
          : `Already saved as #${number} (${existing.status}), now back in the inbox: ${nameOf(existing)}`
      }
      return { number, message: message + (await topicsOf(existing, onCall)) }
    }
    const page = await readPage(url, ctx.send)
    // A link whose page couldn't be read before gets another try.
    if (existing) {
      const { number } = existing
      if (page.fetchError)
        return { number, message: `Already saved as #${number}; its page still can't be read (${page.fetchError}).` }
      await store.setPage(number, page)
      if (asRead) await store.setStatus(number, "read")
      const topics = await tag({ number, title: page.title, site: page.site }, page.content ?? "", onCall)
      const message = `#${number} was saved without its page; it's read now: ${page.title ?? url} (${minutes(page.wordCount)}).`
      return { number, message: message + topics }
    }
    const saved = await store.add({ url, urlKey: key, note: opts.note, status: opts.status, page })
    const { number } = saved
    if (saved.fetchError)
      return {
        number,
        message: `Saved the link as #${number}, but its page couldn't be read (${saved.fetchError}). Saving it again tries once more.`
      }
    const kept = asRead ? `Kept as #${number} (read, not in the inbox)` : `Saved as #${number}`
    const message = `${kept}: ${nameOf(saved)} (${saved.site}, ${minutes(saved.wordCount)}).`
    return { number, message: message + (await topicsOf(saved, onCall)) }
  }

  async function topicNamed(toolName: string, name: string): Promise<Topic> {
    const topic = (await store.topics()).find(each => topicKey(each.name) === topicKey(name))
    if (!topic) throw new ToolError(toolName, `There is no topic called "${name}". ${TOPICS} shows the user's topics.`)
    return topic
  }

  const saveArticle = tool({
    name: SAVE,
    description:
      "Save a link to the user's reading inbox, to read later: the page is fetched, its text kept, and it gets " +
      "topics. Use it when the user asks to save, keep or read something later. Saving a link that's already there " +
      "doesn't duplicate it.",
    schema: z.object({
      url: z.string().describe("The link to save"),
      note: z.string().optional().describe("Why the user saved it, in their words, only if they said")
    }),
    execute: async (args, toolCtx) =>
      (await saveLink(SAVE, args.url, { note: args.note, status: "inbox" }, toolCtx?.onModelCall)).message
  })

  const listArticles = tool({
    name: LIST,
    description:
      "List the user's saved articles, newest first: the inbox (still to read) unless another status is asked for, " +
      "optionally only one topic's. Each line has the article's number, which the other reading tools take, and " +
      'its topics. For "what have I been reading about X", use the topic with status all.',
    schema: z.object({
      status: z
        .enum([...STATUSES, "all"])
        .default("inbox")
        .describe("inbox (to read), read, archived, or all"),
      topic: z.string().optional().describe("Only articles with this topic, by its name"),
      limit: z.int().min(1).max(50).default(10),
      offset: z.int().min(0).default(0).describe("How many to skip, for the next page")
    }),
    execute: async args => {
      const topic = args.topic === undefined ? undefined : await topicNamed(LIST, args.topic)
      const { articles, total } = await store.list({ ...args, topicId: topic?.id })
      const kind = args.status === "all" ? "saved" : args.status
      const about = topic ? ` on "${topic.name}"` : ""
      if (total === 0)
        return args.status === "inbox" && !topic ? "The reading inbox is empty." : `No ${kind} articles${about}.`
      if (articles.length === 0) return `Nothing past ${total} ${kind} articles${about}.`
      const range = `${args.offset + 1}-${args.offset + articles.length} of ${total}`
      const heading = `${args.status}${about}: ${range}, newest first`
      return [heading, ...articles.map(article => line(article, args.status === "all"))].join("\n")
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
      return articleText(article)
    }
  })

  const markArticle = tool({
    name: MARK,
    description:
      "Change a saved article. status: read once the user has finished it, archived when they don't want it in the " +
      "inbox any more (nothing is deleted), inbox to bring it back. topics: replaces its topics, when the user says " +
      "they're wrong.",
    schema: z.object({
      number: numberArg,
      status: z.enum(STATUSES).optional(),
      topics: z.array(z.string()).max(MAX_TOPICS).optional().describe("The article's topics, all of them, by name")
    }),
    execute: async args => {
      if (args.status === undefined && args.topics === undefined)
        throw new ToolError(MARK, "Give a status, topics, or both.")
      const done: string[] = []
      if (args.topics !== undefined) {
        const names = args.topics.map(cleanTopic).filter(Boolean)
        const topics = await store.setArticleTopics(args.number, names)
        if (!topics) throw new ToolError(MARK, `There is no article #${args.number}.`)
        const list = topics.map(topic => topic.name).join(", ")
        done.push(list ? `#${args.number}'s topics are now: ${list}.` : `#${args.number} has no topics now.`)
      }
      if (args.status !== undefined) {
        if (!(await store.setStatus(args.number, args.status)))
          throw new ToolError(MARK, `There is no article #${args.number}.`)
        done.push(
          args.status === "inbox" ? `#${args.number} is back in the inbox.` : `#${args.number} is ${args.status}.`
        )
      }
      return done.join(" ")
    }
  })

  const listTopics = tool({
    name: TOPICS,
    description:
      "List the user's reading topics: the subjects their saved articles are about, with how many articles each " +
      "has. Followed topics come first; a muted one is a subject the user doesn't want more of.",
    schema: z.object({}),
    execute: async () => {
      const topics = await store.topics()
      if (topics.length === 0) return "No topics yet: they appear as articles are saved."
      const count = topics.length === 1 ? "1 topic" : `${topics.length} topics, followed first`
      return [count, ...topics.map(topicLine)].join("\n")
    }
  })

  const updateTopic = tool({
    name: TOPIC,
    description:
      "Change one of the user's reading topics: follow it (a standing interest), mute it (a subject they don't " +
      "want more of; Kaja never offers to follow it), set it back to neutral, rename it, or merge it into another " +
      "topic (its articles move there and it disappears).",
    schema: z.object({
      topic: z.string().describe("The topic's current name"),
      state: z.enum(TOPIC_STATES).optional(),
      rename: z.string().optional().describe("Its new name"),
      merge_into: z.string().optional().describe("The name of the topic that takes over its articles")
    }),
    execute: async args => {
      const topic = await topicNamed(TOPIC, args.topic)
      if (args.merge_into !== undefined) {
        const target = await topicNamed(TOPIC, args.merge_into)
        if (target.id === topic.id) throw new ToolError(TOPIC, "A topic can't be merged into itself.")
        await store.mergeTopics(topic.id, target.id)
        return `"${topic.name}" is merged into "${target.name}".`
      }
      const rename = args.rename === undefined ? undefined : cleanTopic(args.rename)
      if (!rename && args.state === undefined)
        throw new ToolError(TOPIC, "Give a state, a new name, or a topic to merge into.")
      if (rename && topicKey(rename) !== topicKey(topic.name)) {
        const taken = (await store.topics()).find(each => topicKey(each.name) === topicKey(rename))
        if (taken)
          throw new ToolError(TOPIC, `There is already a topic called "${taken.name}": merge into it with merge_into.`)
      }
      await store.updateTopic(topic.id, { name: rename || undefined, state: args.state })
      // The user has decided about it, so Kaja won't offer to follow it later.
      if (args.state !== undefined) await store.markOffered(topic.id)
      const name = rename || topic.name
      const stateWords = args.state === "neutral" ? "neither followed nor muted" : args.state
      return [
        rename ? `"${topic.name}" is now "${rename}".` : undefined,
        args.state === undefined ? undefined : `"${name}" is ${stateWords}.`
      ]
        .filter(Boolean)
        .join(" ")
    }
  })

  const linkReceived = tool({
    name: LINK,
    description:
      "Call this when the user's whole message is a link and nothing else, instead of fetching it: it saves the " +
      "link for later, or returns the article to read now, as the user chose before; the first time it tells you " +
      "to ask them. A link that comes with a question or an instruction is not for this tool.",
    schema: z.object({
      url: z.string().describe("The link the user sent"),
      choice: z.enum(["save", "read"]).optional().describe("The user's answer, only right after asking them")
    }),
    execute: async (args, toolCtx) => {
      if (!urlKey(args.url)) throw new ToolError(LINK, `Not a web link: ${args.url.trim()}`)
      if (args.choice) await settings.set({ bareLinks: args.choice })
      const preference = args.choice ?? (await settings.get()).bareLinks
      if (preference === "ask") return ASK_ABOUT_LINKS
      if (preference === "save")
        return (await saveLink(LINK, args.url, { status: "inbox" }, toolCtx?.onModelCall)).message
      const kept = await saveLink(LINK, args.url, { status: "read" }, toolCtx?.onModelCall)
      const article = await store.open(kept.number)
      if (article?.content === undefined) return kept.message
      return `${kept.message}\nThe user wants to read it now: tell them what it says.\n\n${articleText(article)}`
    }
  })

  const setLinkPreference = tool({
    name: LINK_PREFERENCE,
    description:
      "Change what a link sent on its own does from now on: save (to the reading inbox), read (read it now, kept as " +
      "read), or ask (ask again next time). Use it when the user says how they want links handled.",
    schema: z.object({ preference: z.enum(BARE_LINK_CHOICES) }),
    execute: async args => {
      await settings.set({ bareLinks: args.preference })
      if (args.preference === "ask") return "The next link sent on its own asks what to do with it."
      return args.preference === "save"
        ? "Links sent on their own are saved to the inbox from now on."
        : "Links sent on their own are read at once from now on, and kept as read."
    }
  })

  return [
    saveArticle,
    listArticles,
    readArticleTool,
    markArticle,
    listTopics,
    updateTopic,
    linkReceived,
    setLinkPreference
  ]
}
