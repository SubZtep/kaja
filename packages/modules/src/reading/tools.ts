import { type Tool, tool, type ToolContext, ToolError } from "@kaja/nasi"
import { z } from "zod"
import type { ModuleContext } from "../contract"
import { scheduleJob } from "../core/jobs"
import { moduleSettings } from "../core/settings"
import { DAILY_CAP, discover, DISCOVER_JOB, sources } from "./discover"
import { READING_ID } from "./manifest"
import { hostOf, readPage } from "./page"
import { BARE_LINK_CHOICES, ReadingSettingsSchema } from "./settings"
import { type Article, type ArticleSummary, createReadingStore, type Topic, topicKey } from "./store"
import { assignTopics, MAX_TOPICS } from "./tagging"
import { urlKey } from "./url"

/** A topic with this many saved articles is one Kaja offers to follow. */
export const FOLLOW_OFFER_AT = 3
/** How long after a search the user can ask for another. */
export const FIND_AGAIN_MINUTES = 60
const WORDS_PER_MINUTE = 230
const LIST_STATUSES = ["inbox", "read", "archived", "suggested", "all"] as const
const MARK_STATUSES = ["inbox", "read", "archived", "dismissed"] as const
const TOPIC_STATES = ["followed", "neutral", "muted"] as const

const SAVE = "save_article"
const LIST = "list_articles"
const READ = "read_article"
const MARK = "mark_article"
const TOPICS = "list_topics"
const TOPIC = "update_topic"
const FIND = "find_articles"
/** The tool a message that is only a link goes to; the module's prompt section is tied to it. */
export const LINK = "link_received"
const SETTINGS = "update_reading_settings"

const ASK_ABOUT_LINKS =
  "The user hasn't said yet what a link sent on its own should do. Ask them once with ask_user (\"Save it for " +
  'later, or read it now?", options "Save for later" and "Read it now"), then call link_received again with the ' +
  'same url and choice "save" or "read". Their choice is remembered for later links.'

type OnModelCall = ToolContext["onModelCall"]

const numberArg = z.int().min(1).describe("The article's number, as save_article and list_articles show it (#3 is 3)")

function nameOf(article: Pick<ArticleSummary, "title" | "url">): string {
  return article.title ?? article.url
}

function minutes(words: number): string {
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min`
}

function sourceName(article: ArticleSummary): string | undefined {
  return sources.find(source => source.id === article.source)?.name
}

// "#3, #4 and #7"
function numbered(numbers: number[]): string {
  const names = numbers.map(number => `#${number}`)
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

// One list line: "#3 Title — site, saved 2026-11-13, 8 min · AI agents, Rust"; a suggestion also says where it was found, and what it says below.
function line(article: ArticleSummary, withStatus: boolean): string {
  const read = article.fetchError ? "page couldn't be read" : minutes(article.wordCount)
  const site = article.site ?? hostOf(article.url)
  const from = sourceName(article)
  const when = `${from ? "found" : "saved"} ${article.savedAt.slice(0, 10)}`
  const points = from && article.score !== undefined ? `, ${article.score} points on ${from}` : ""
  const status = withStatus ? `, ${article.status}` : ""
  const topics = article.topics.length > 0 ? ` · ${article.topics.join(", ")}` : ""
  const gist = article.status === "suggested" && article.gist ? `\n   ${article.gist}` : ""
  return `#${article.number} ${nameOf(article)} — ${site}, ${when}, ${read}${points}${status}${topics}${gist}`
}

// An article as the model reads it: what's known about it, then its text.
function articleText(article: Article): string {
  const about = [article.url, article.site, article.author, `status: ${article.status}`].filter(Boolean).join(" · ")
  const from = sourceName(article)
  const lines = [
    `# ${nameOf(article)}`,
    about,
    from ? `Found on ${from}${article.discussionUrl ? `, discussed at ${article.discussionUrl}` : ""}` : undefined,
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
    const topics = tagging && (await store.setArticleTopics(article.number, tagging.topics, { gist: tagging.gist }))
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
          'ask_user and the options "Follow" and "Not now", whether to follow it: Kaja then looks for new stories ' +
          `about it. On "Follow" call ${TOPIC} with state "followed".`
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

  // Saves a link (or finds it already there) for the inbox, or as read for a link the user reads at once; returns its number and what to tell the model.
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
      const now = asRead ? "now marked read" : "now in the inbox"
      let message: string
      if (existing.status === opts.status)
        message = asRead
          ? `Already kept as #${number} (read): ${nameOf(existing)}`
          : `Already in the inbox as #${number}: ${nameOf(existing)}`
      else {
        await store.setStatus(number, opts.status)
        if (existing.status === "suggested" || existing.status === "dismissed")
          message = `Kaja had found it already, as #${number}; ${now}: ${nameOf(existing)}`
        else
          message = asRead
            ? `Already saved as #${number}, ${now}: ${nameOf(existing)}`
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
      await store.setStatus(number, opts.status)
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
      "List the user's articles, newest first: the inbox (still to read) unless another status is asked for, " +
      "optionally only one topic's. suggested lists the stories Kaja found for the user's followed topics and they " +
      "haven't looked at yet. Each line has the article's number, which the other reading tools take, and its " +
      'topics. For "what have I been reading about X", use the topic with status all.',
    schema: z.object({
      status: z
        .enum(LIST_STATUSES)
        .default("inbox")
        .describe("inbox (to read), read, archived, suggested (found by Kaja), or all the user saved or kept"),
      topic: z.string().optional().describe("Only articles with this topic, by its name"),
      limit: z.int().min(1).max(50).default(10),
      offset: z.int().min(0).default(0).describe("How many to skip, for the next page")
    }),
    execute: async args => {
      const topic = args.topic === undefined ? undefined : await topicNamed(LIST, args.topic)
      const { articles, total } = await store.list({ ...args, topicId: topic?.id })
      const kind = args.status === "all" ? "saved" : args.status
      const about = topic ? ` on "${topic.name}"` : ""
      // The inbox also says what waits beside it, so the user hears of it without asking.
      const waiting = args.status === "inbox" && !topic ? await store.suggestedCount() : 0
      const suggested =
        waiting > 0
          ? `\nKaja also found ${waiting === 1 ? "1 story" : `${waiting} stories`} for the user's topics: ${LIST} with status suggested shows ${waiting === 1 ? "it" : "them"}.`
          : ""
      if (total === 0) {
        if (args.status === "suggested" && !topic)
          return "No suggestions are waiting. Kaja looks for stories on the followed topics about once a day."
        return (
          (args.status === "inbox" && !topic ? "The reading inbox is empty." : `No ${kind} articles${about}.`) +
          suggested
        )
      }
      if (articles.length === 0) return `Nothing past ${total} ${kind} articles${about}.`
      const range = `${args.offset + 1}-${args.offset + articles.length} of ${total}`
      const heading = `${args.status}${about}: ${range}, newest first`
      const hint =
        args.status === "suggested"
          ? `\n${MARK} keeps one (status inbox) or turns it down (status dismissed); untouched ones go after two weeks.`
          : ""
      return [heading, ...articles.map(article => line(article, args.status === "all"))].join("\n") + hint + suggested
    }
  })

  const readArticleTool = tool({
    name: READ,
    description:
      "Get an article's text as it was when saved or found, to read it to the user, summarise it or answer " +
      "questions about it. Works when the page is gone. Reading a suggestion keeps it: it moves to the inbox.",
    schema: z.object({ number: numberArg }),
    execute: async (args, toolCtx) => {
      let article = await store.open(args.number)
      if (!article) throw new ToolError(READ, `There is no article #${args.number}.`)
      // A page that couldn't be read when the link arrived gets another try now.
      if (article.content === undefined) {
        const page = await readPage(article.url, ctx.send)
        if (page.fetchError)
          return `#${article.number} (${article.url}) is kept, but its page can't be read: ${page.fetchError}.`
        await store.setPage(article.number, { ...page, title: article.title ?? page.title })
        if (!article.tagged) await tag(article, page.content ?? "", toolCtx?.onModelCall)
      }
      const kept = article.status === "suggested" && (await store.setStatus(article.number, "inbox", "suggested"))
      if (kept || article.content === undefined) article = (await store.open(args.number)) ?? article
      return (kept ? `#${article.number} was a suggestion; it's in the inbox now.\n\n` : "") + articleText(article)
    }
  })

  const markArticle = tool({
    name: MARK,
    description:
      "Change articles. status: read once the user has finished one, archived when they don't want it in the " +
      "inbox any more (nothing is deleted), inbox to bring it back or to keep a suggestion, dismissed to turn a " +
      "suggestion down. topics: replaces one article's topics, when the user says they're wrong.",
    schema: z.object({
      numbers: z.array(numberArg).min(1).max(20).describe("The articles' numbers: one, or several to change alike"),
      status: z.enum(MARK_STATUSES).optional(),
      topics: z.array(z.string()).max(MAX_TOPICS).optional().describe("The article's topics, all of them, by name")
    }),
    execute: async args => {
      if (args.status === undefined && args.topics === undefined)
        throw new ToolError(MARK, "Give a status, topics, or both.")
      const numbers = [...new Set(args.numbers)]
      const [first] = numbers
      const done: string[] = []
      if (args.topics !== undefined && first !== undefined) {
        if (numbers.length > 1) throw new ToolError(MARK, "Topics are set for one article at a time.")
        const names = args.topics.map(cleanTopic).filter(Boolean)
        const topics = await store.setArticleTopics(first, names)
        if (!topics) throw new ToolError(MARK, `There is no article #${first}.`)
        const list = topics.map(topic => topic.name).join(", ")
        done.push(list ? `#${first}'s topics are now: ${list}.` : `#${first} has no topics now.`)
      }
      if (args.status !== undefined) {
        const { status } = args
        const dismissing = status === "dismissed"
        const moved: number[] = []
        const missed: number[] = []
        for (const number of numbers)
          ((await store.setStatus(number, status, dismissing ? "suggested" : undefined)) ? moved : missed).push(number)
        const problem = dismissing
          ? `Only a suggestion can be dismissed (a saved article is archived instead): ${numbered(missed)} ${missed.length === 1 ? "isn't" : "aren't"} one.`
          : `There is no article ${numbered(missed)}.`
        if (moved.length === 0) throw new ToolError(MARK, problem)
        const be = moved.length === 1 ? "is" : "are"
        done.push(`${numbered(moved)} ${be} ${status === "inbox" ? "back in the inbox" : status}.`)
        if (missed.length > 0) done.push(problem)
      }
      return done.join(" ")
    }
  })

  const listTopics = tool({
    name: TOPICS,
    description:
      "List the user's reading topics: the subjects their saved articles are about, with how many articles each " +
      "has. Followed topics come first (Kaja looks for new stories about those); a muted one is a subject the user " +
      "doesn't want more of.",
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
      "Change one of the user's reading topics: follow it (Kaja then looks for new stories about it, about once a " +
      "day), mute it (a subject they don't want more of; Kaja never suggests it or offers to follow it), set it " +
      "back to neutral, rename it, or merge it into another topic (its articles move there and it disappears).",
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
      // A followed topic is what the account's search is for: it runs within minutes, then daily.
      const searching = args.state === "followed" && (await settings.get()).suggestions
      if (searching) await scheduleJob(ctx, READING_ID, DISCOVER_JOB)
      const name = rename || topic.name
      const stateWords = args.state === "neutral" ? "neither followed nor muted" : args.state
      return [
        rename ? `"${topic.name}" is now "${rename}".` : undefined,
        args.state === undefined ? undefined : `"${name}" is ${stateWords}.`,
        searching
          ? `Kaja looks for stories about it from now on; the first ones can be there in a few minutes (${LIST} with status suggested).`
          : undefined
      ]
        .filter(Boolean)
        .join(" ")
    }
  })

  const findArticles = tool({
    name: FIND,
    description:
      "Look right now for new stories about the user's followed topics (on Hacker News), instead of waiting for " +
      "the daily search. Use it when the user asks whether there is anything new; what was found earlier is in " +
      `${LIST} with status suggested. It runs at most once an hour and finds at most ${DAILY_CAP} stories a day.`,
    schema: z.object({}),
    execute: async (_args, toolCtx) => {
      const waiting = async () => {
        const count = await store.suggestedCount()
        return count > 0
          ? ` ${count === 1 ? "1 earlier suggestion is" : `${count} earlier suggestions are`} waiting (${LIST} with status suggested).`
          : ""
      }
      const { suggestions, discoveredAt } = await settings.get()
      if (!suggestions) return `Suggestions are switched off for this user; ${SETTINGS} switches them on.`
      const since = discoveredAt ? (Date.now() - Date.parse(discoveredAt)) / 60_000 : Number.POSITIVE_INFINITY
      if (since < FIND_AGAIN_MINUTES) {
        const ago = Math.max(1, Math.round(since))
        const wait = Math.max(1, Math.ceil(FIND_AGAIN_MINUTES - since))
        return `Kaja looked ${ago} min ago; the next search can run in ${wait} min.${await waiting()}`
      }
      let result: Awaited<ReturnType<typeof discover>>
      try {
        result = await discover(ctx, toolCtx?.onModelCall)
      } catch {
        return `The search couldn't run just now. Kaja tries again by itself later.${await waiting()}`
      }
      switch (result.state) {
        case "no-topics":
          return `The user follows no topic yet, so there is nothing to look for. ${TOPIC} follows one (${TOPICS} shows them).`
        case "no-model":
          return "The search can't run here: no model is set up for it."
        case "capped":
          return `Kaja already found ${DAILY_CAP} stories in the last day, which is the most it keeps.${await waiting()}`
        case "found": {
          const count = result.found.length === 1 ? "1 new story" : `${result.found.length} new stories`
          return [`Found ${count}:`, ...result.found.map(article => line(article, false))].join("\n")
        }
        default:
          return `Nothing new about the followed topics since the last search.${await waiting()}`
      }
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

  const updateSettings = tool({
    name: SETTINGS,
    description:
      "Change how reading works for the user from now on. bare_links: what a link sent on its own does: save (to " +
      "the inbox), read (read it now, kept as read) or ask (ask again next time). suggestions: whether Kaja looks " +
      "for new stories about the followed topics. Use it when the user says how they want either handled.",
    schema: z.object({
      bare_links: z.enum(BARE_LINK_CHOICES).optional(),
      suggestions: z.boolean().optional()
    }),
    execute: async args => {
      if (args.bare_links === undefined && args.suggestions === undefined)
        throw new ToolError(SETTINGS, "Give bare_links, suggestions, or both.")
      const done: string[] = []
      if (args.bare_links !== undefined) {
        await settings.set({ bareLinks: args.bare_links })
        if (args.bare_links === "ask") done.push("The next link sent on its own asks what to do with it.")
        else
          done.push(
            args.bare_links === "save"
              ? "Links sent on their own are saved to the inbox from now on."
              : "Links sent on their own are read at once from now on, and kept as read."
          )
      }
      if (args.suggestions !== undefined) {
        await settings.set({ suggestions: args.suggestions })
        // Its job left when suggestions went off; it starts over now.
        if (args.suggestions) await scheduleJob(ctx, READING_ID, DISCOVER_JOB)
        done.push(
          args.suggestions
            ? "Kaja looks for stories about the followed topics again."
            : "Kaja no longer looks for stories; the suggestions already found stay until they're two weeks old."
        )
      }
      return done.join(" ")
    }
  })

  return [
    saveArticle,
    listArticles,
    readArticleTool,
    markArticle,
    listTopics,
    updateTopic,
    findArticles,
    linkReceived,
    updateSettings
  ]
}
