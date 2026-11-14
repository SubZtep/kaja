import type { ModelCallUsage } from "@kaja/nasi"
import { z } from "zod"
import type { GlobalJobContext, ModuleContext } from "../contract"
import { moduleSettings } from "../core/settings"
import { hackerNews } from "./hacker-news"
import { READING_ID } from "./manifest"
import { readPage } from "./page"
import { ReadingSettingsSchema } from "./settings"
import { type Candidate, keepSourceItems, pruneSourceItems, type Source } from "./sources"
import { type ArticleSummary, createReadingStore, expireSuggestions, topicKey } from "./store"
import { assignTopics, MAX_TOPICS } from "./tagging"

/** Where stories are looked for. */
export const sources: readonly Source[] = [hackerNews]

/** The job that looks for stories for one account; `scheduleJob` starts it when a topic is followed. */
export const DISCOVER_JOB = "discover"
/** How many found stories an account gets in any 24 hours, however often the search runs. */
export const DAILY_CAP = 5
/** How many of the sources' new stories one search shows the model. */
export const MAX_CANDIDATES = 60
/** A suggestion nobody looked at is deleted after this long. */
export const SUGGESTION_DAYS = 14
const SOURCE_ITEM_DAYS = 7
const MATCH_TIMEOUT_MS = 60_000
const DAY_MS = 24 * 60 * 60 * 1000

type OnModelCall = (usage: ModelCallUsage) => void

/** What a search did: `found` holds the new suggestions when the state is `found`. */
export type Discovery = {
  state: "off" | "no-topics" | "no-model" | "capped" | "nothing-new" | "no-match" | "found"
  found: ArticleSummary[]
}

/**
 * Fetches every source's list of the last day and keeps it for the accounts' searches; also forgets old list entries
 * and the suggestions nobody looked at.
 */
export async function collect(ctx: Pick<GlobalJobContext, "sql" | "send">, at: Date = new Date()): Promise<void> {
  for (const source of sources) {
    const items = await source.fetch(ctx.send, new Date(at.getTime() - DAY_MS))
    await keepSourceItems(ctx.sql, source.id, items, at)
  }
  await pruneSourceItems(ctx.sql, new Date(at.getTime() - SOURCE_ITEM_DAYS * DAY_MS))
  await expireSuggestions(ctx.sql, new Date(at.getTime() - SUGGESTION_DAYS * DAY_MS))
}

const ReplySchema = z.object({ matches: z.array(z.object({ n: z.number(), topic: z.string() })) })

function instructions(followed: string[], muted: string[], max: number): string {
  return (
    "You pick stories for one reader from a list of today's popular links. Reply with JSON only, no other text: " +
    '{"matches": [{"n": 12, "topic": "..."}]}\n' +
    `The reader follows these topics: ${followed.join(", ")}.\n` +
    (muted.length > 0 ? `The reader does not want stories about: ${muted.join(", ")}.\n` : "") +
    `matches: at most ${max} stories that are really about one of the followed topics, the best fit first. n is ` +
    "the story's number in the list; topic is the followed topic it belongs to, exactly as written above. A story " +
    'that only touches a topic loosely does not count. When nothing fits, reply {"matches": []}.'
  )
}

/** The model's picks as list positions (from 0) with their followed topic; undefined when the reply has no usable JSON. */
export function parseMatches(
  reply: string,
  count: number,
  followed: string[]
): { index: number; topic: string }[] | undefined {
  const start = reply.indexOf("{")
  const end = reply.lastIndexOf("}")
  if (start < 0 || end <= start) return undefined
  let json: unknown
  try {
    json = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
  const parsed = ReplySchema.safeParse(json)
  if (!parsed.success) return undefined
  const byKey = new Map(followed.map(name => [topicKey(name), name]))
  const picked = new Map<number, string>()
  for (const match of parsed.data.matches) {
    const index = match.n - 1
    const topic = byKey.get(topicKey(match.topic))
    if (Number.isInteger(index) && index >= 0 && index < count && topic && !picked.has(index)) picked.set(index, topic)
  }
  return [...picked].map(([index, topic]) => ({ index, topic }))
}

// One model call: which of the candidates are about a followed topic. Throws when the call or its reply is no use.
async function matchStories(
  model: NonNullable<ModuleContext["model"]>,
  candidates: Candidate[],
  topics: { followed: string[]; muted: string[] },
  max: number,
  onCall?: OnModelCall
): Promise<{ candidate: Candidate; topic: string }[]> {
  const list = candidates.map((each, index) => `${index + 1}. ${each.title} (${new URL(each.url).hostname})`)
  const startedAt = performance.now()
  const completion = await model.client.chat.completions.create(
    {
      model: model.model,
      messages: [
        { role: "system", content: instructions(topics.followed, topics.muted, max) },
        { role: "user", content: list.join("\n") }
      ]
    },
    { signal: AbortSignal.timeout(MATCH_TIMEOUT_MS) }
  )
  onCall?.({
    model: completion.model || model.model,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
    latencyMs: Math.round(performance.now() - startedAt)
  })
  const matches = parseMatches(completion.choices[0]?.message.content ?? "", candidates.length, topics.followed)
  if (!matches) throw new Error("The model's reply named no stories in a usable form")
  return matches.slice(0, max).map(match => ({ candidate: candidates[match.index]!, topic: match.topic }))
}

/**
 * Looks through what the sources offered since the account's last search for stories on its followed topics, and keeps
 * the best as suggestions: read through `ctx.send`, with a gist, under their topic. One model call to pick, one per
 * kept story for its gist. Throws when the picking call fails, so a job tries again and a tool can say so.
 */
export async function discover(ctx: ModuleContext, onCall?: OnModelCall, at: Date = new Date()): Promise<Discovery> {
  const store = createReadingStore(ctx.sql, ctx.userId)
  const settings = moduleSettings(ctx, READING_ID, ReadingSettingsSchema)
  const nothing = (state: Discovery["state"]): Discovery => ({ state, found: [] })

  const { suggestions, discoveredAt } = await settings.get()
  if (!suggestions) return nothing("off")
  const topics = await store.topics()
  const followed = topics.filter(topic => topic.state === "followed").map(topic => topic.name)
  if (followed.length === 0) return nothing("no-topics")
  if (!ctx.model) return nothing("no-model")
  const room = DAILY_CAP - (await store.foundSince(new Date(at.getTime() - DAY_MS)))
  if (room <= 0) return nothing("capped")

  const candidates = await store.candidates(discoveredAt, MAX_CANDIDATES)
  if (candidates.length === 0) {
    await settings.set({ discoveredAt: at.toISOString() })
    return nothing("nothing-new")
  }
  const muted = topics.filter(topic => topic.state === "muted").map(topic => topic.name)
  const matches = await matchStories(ctx.model, candidates, { followed, muted }, room, onCall)
  await settings.set({ discoveredAt: at.toISOString() })
  if (matches.length === 0) return nothing("no-match")

  // Pages are read side by side; the rows are written one after another, as each takes the account's next number.
  const pages = await Promise.all(matches.map(match => readPage(match.candidate.url, ctx.send)))
  const kept: { number: number; topic: string; content?: string; title: string; site?: string }[] = []
  for (const [index, { candidate, topic }] of matches.entries()) {
    const page = pages[index]!
    const saved = await store.add({
      url: candidate.url,
      urlKey: candidate.urlKey,
      status: "suggested",
      found: { source: candidate.source, discussionUrl: candidate.discussionUrl, score: candidate.score },
      // The source's title is the one its readers voted on; a page's own often carries the site's name.
      page: { ...page, title: candidate.title }
    })
    // A link saved by the user meanwhile stays theirs.
    if (saved.source === candidate.source && saved.status === "suggested")
      kept.push({ number: saved.number, topic, content: page.content, title: candidate.title, site: page.site })
  }
  // A suggestion never brings a topic of its own: it sits under what the user follows.
  const followedKeys = new Set(followed.map(topicKey))
  const taggings = await Promise.all(
    kept.map(async article =>
      article.content ? assignTopics(ctx, { ...article, content: article.content }, followed, onCall) : undefined
    )
  )
  for (const [index, article] of kept.entries()) {
    const tagging = taggings[index]
    const more = (tagging?.topics ?? []).filter(name => followedKeys.has(topicKey(name)))
    const names = [...new Map([article.topic, ...more].map(name => [topicKey(name), name])).values()]
    // Without a gist it stays untagged, so keeping it later tags it then.
    await store.setArticleTopics(article.number, names.slice(0, MAX_TOPICS), {
      gist: tagging?.gist,
      tagged: tagging !== undefined
    })
  }
  const found = (await store.list({ status: "suggested", limit: 50, offset: 0 })).articles.filter(article =>
    kept.some(each => each.number === article.number)
  )
  return { state: "found", found }
}
