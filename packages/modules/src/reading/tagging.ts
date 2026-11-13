import { languageName, type ToolContext, warn } from "@kaja/nasi"
import { z } from "zod"
import type { ModuleContext } from "../contract"
import { topicKey } from "./store"

/** How much of an article the tagging model reads: its start says what it's about. */
const MAX_TAGGING_CHARS = 6000
/** The user's topics the model is shown to reuse, most used first. */
export const MAX_KNOWN_TOPICS = 100
export const MAX_TOPICS = 3
const MAX_TOPIC_CHARS = 40
const MAX_GIST_CHARS = 200
const TAGGING_TIMEOUT_MS = 30_000

const ReplySchema = z.object({ topics: z.array(z.string()).min(1), gist: z.string().optional() })

export type Tagging = { topics: string[]; gist?: string }

type OnModelCall = NonNullable<ToolContext["onModelCall"]>

function instructions(language: string): string {
  return (
    "You file articles in one reader's personal library. Reply with JSON only, no other text: " +
    '{"topics": ["..."], "gist": "..."}\n' +
    `topics: 1 to ${MAX_TOPICS} subjects the article is really about. Each is specific, two or three words, such as ` +
    '"AI agents", "Postgres internals" or "Terminal UIs"; never a broad field ("Technology", "Programming") and ' +
    "never the article's own title. The reader's existing topics are listed first: reuse one, exactly as written, " +
    "whenever it fits, and add a new one only when none does.\n" +
    "gist: one sentence of at most 160 characters on what the article claims or shows.\n" +
    `Write new topics and the gist in ${language}.`
  )
}

/** The model's reply as topics and a gist, or undefined when it holds no usable JSON. */
export function parseTagging(reply: string, known: string[]): Tagging | undefined {
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
  // An existing topic keeps the name the user knows it by, however the model spelled it.
  const knownByKey = new Map(known.map(name => [topicKey(name), name]))
  const topics = new Map<string, string>()
  for (const raw of parsed.data.topics) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TOPIC_CHARS).trim()
    const key = topicKey(name)
    if (key && !topics.has(key) && topics.size < MAX_TOPICS) topics.set(key, knownByKey.get(key) ?? name)
  }
  if (topics.size === 0) return undefined
  const gist = parsed.data.gist?.trim().replace(/\s+/g, " ").slice(0, MAX_GIST_CHARS)
  return { topics: [...topics.values()], gist: gist || undefined }
}

/**
 * Decides an article's topics and its one-line gist: the one place that does, so another signal (embeddings) can join
 * here later. One call to the module's model; undefined when there's no model, the call fails or its reply can't be
 * used, and the article then stays untagged.
 */
export async function assignTopics(
  ctx: Pick<ModuleContext, "model" | "language">,
  article: { title?: string; site?: string; content: string },
  known: string[],
  onCall?: OnModelCall
): Promise<Tagging | undefined> {
  if (!ctx.model) return undefined
  const existing = known.slice(0, MAX_KNOWN_TOPICS)
  const about = [
    `Existing topics: ${existing.length > 0 ? existing.join(", ") : "none yet"}`,
    article.title ? `Title: ${article.title}` : undefined,
    article.site ? `Site: ${article.site}` : undefined
  ].filter(Boolean)
  const startedAt = performance.now()
  try {
    const completion = await ctx.model.client.chat.completions.create(
      {
        model: ctx.model.model,
        messages: [
          { role: "system", content: instructions((ctx.language && languageName(ctx.language)) || "English") },
          { role: "user", content: `${about.join("\n")}\n\n${article.content.slice(0, MAX_TAGGING_CHARS)}` }
        ]
      },
      { signal: AbortSignal.timeout(TAGGING_TIMEOUT_MS) }
    )
    onCall?.({
      model: completion.model || ctx.model.model,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      latencyMs: Math.round(performance.now() - startedAt)
    })
    const tagging = parseTagging(completion.choices[0]?.message.content ?? "", existing)
    if (!tagging) warn("Reading: the tagging model's reply had no usable topics", { model: ctx.model.model })
    return tagging
  } catch (error) {
    warn("Reading: an article couldn't be tagged", { error: error instanceof Error ? error.message : String(error) })
    return undefined
  }
}
